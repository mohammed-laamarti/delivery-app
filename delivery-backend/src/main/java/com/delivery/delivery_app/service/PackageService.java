package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.dto.PackageRequest;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.exception.ConfirmationAlreadyClaimedException;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import com.delivery.delivery_app.entity.PackageHistoryEntity;
import com.delivery.delivery_app.enums.ConfirmationOutcome;
import com.delivery.delivery_app.enums.DeliveryResult;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PackageService {
    private static final java.time.Duration CONFIRMATION_CLAIM_DURATION = java.time.Duration.ofMinutes(15);
    private static final Pattern CONFIRMATION_REPORT_DATE = Pattern.compile("CONFIRMATION_CALLBACK_REQUESTED\\s*\\|\\s*Rappel:\\s*([^|\\s]+)");
    private static final Pattern DELIVERY_REPORT_DATE = Pattern.compile("Livraison reportée au\\s*(\\d{4}-\\d{2}-\\d{2})");
    private final PackageRepository packageRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final PackageHistoryRepository packageHistoryRepository;
    private final UserService userService;

    public PackageService(PackageRepository packageRepository, DeliveryAttemptRepository deliveryAttemptRepository,
            PackageHistoryRepository packageHistoryRepository, UserService userService) {
        this.packageRepository = packageRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.packageHistoryRepository = packageHistoryRepository;
        this.userService = userService;
    }

    @Transactional
    public List<PackageDto> findAll() {
        LocalDateTime now = LocalDateTime.now();
        LocalDate today = now.toLocalDate();
        return packageRepository.findAllByOrderByCreatedAtDesc().stream()
                .peek(entity -> {
                    restoreLatestConfirmationCommentIfNeeded(entity);
                    restoreDueConfirmationReportDateIfNeeded(entity, today);
                    restoreDueDeliveryReportDateIfNeeded(entity, today);
                    activateDueConfirmationReportIfNeeded(entity, now);
                    activateDueDeliveryReportIfNeeded(entity, today, now);
                })
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<PackageDto> findByDriver(Long driverId) {
        return packageRepository.findByDriverId(driverId).stream().map(this::toDto).toList();
    }

    @Transactional
    public List<PackageDto> findDriverWorkspace(Long driverId) {
        LocalDateTime now = LocalDateTime.now();
        LocalDate today = now.toLocalDate();
        return packageRepository.findDriverWorkspace(
                        driverId,
                        List.of(PackageStatus.ASSIGNED, PackageStatus.IN_DELIVERY, PackageStatus.POSTPONED),
                        List.of(PackageStatus.TO_CONFIRM, PackageStatus.NO_ANSWER, PackageStatus.TO_RECEIVE),
                        PackageStatus.AT_AGENCY, PackageStatus.POSTPONED, PackageStatus.CANCELLED)
                .stream()
                .peek(entity -> {
                    restoreLatestConfirmationCommentIfNeeded(entity);
                    restoreDueConfirmationReportDateIfNeeded(entity, today);
                    restoreDueDeliveryReportDateIfNeeded(entity, today);
                    activateDueConfirmationReportIfNeeded(entity, now);
                    activateDueDeliveryReportIfNeeded(entity, today, now);
                })
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public PackageDto findById(Long id) {
        return toDto(getPackage(id));
    }

    @Transactional(readOnly = true)
    public PackageDto findByTrackingCode(String trackingCode) {
        return packageRepository.findByTrackingCode(trackingCode).map(this::toDto)
                .orElseThrow(() -> new IllegalArgumentException("Package introuvable: " + trackingCode));
    }

    public PackageDto create(PackageRequest request) {
        if (packageRepository.existsByTrackingCode(request.trackingCode())) {
            throw new IllegalArgumentException("Un package existe deja avec ce code de suivi.");
        }
        PackageEntity entity = new PackageEntity();
        entity.setTrackingCode(request.trackingCode());
        entity.setRecipient(request.recipient());
        entity.setPhone(request.phone());
        entity.setCity(request.city());
        entity.setAddress(request.address());
        entity.setPrice(request.price());
        entity.setImportComment(request.importComment());
        entity.setStatus(PackageStatus.TO_CONFIRM);
        entity.setDriver(findDriver(request.driverId()));
        entity.setCreatedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto update(Long id, PackageRequest request) {
        return update(id, request, null);
    }

    public PackageDto update(Long id, PackageRequest request, Long adminUserId) {
        PackageEntity entity = getPackage(id);
        PackageStatus oldStatus = entity.getStatus();
        UserEntity previousDriver = entity.getDriver();
        LocalDate previousDeliveryDate = entity.getNextDeliveryDate();
        packageRepository.findByTrackingCode(request.trackingCode())
                .filter(existing -> !existing.getId().equals(id))
                .ifPresent(existing -> { throw new IllegalArgumentException("Un package existe deja avec ce code de suivi."); });
        entity.setTrackingCode(request.trackingCode());
        entity.setRecipient(request.recipient());
        entity.setPhone(request.phone());
        entity.setCity(request.city());
        entity.setAddress(request.address());
        entity.setPrice(request.price());
        entity.setImportComment(request.importComment());
        if (request.status() == PackageStatus.POSTPONED && request.nextDeliveryDate() == null) {
            throw new IllegalArgumentException("La nouvelle date de livraison est obligatoire pour un colis reporté.");
        }
        PackageStatus newStatus = request.status() == null ? oldStatus : request.status();
        applyAdminTransition(entity, oldStatus, newStatus, request.driverId());
        entity.setNextDeliveryDate(newStatus == PackageStatus.POSTPONED ? request.nextDeliveryDate() : null);
        entity.setUpdatedAt(LocalDateTime.now());
        boolean reportDateChanged = newStatus == PackageStatus.POSTPONED
                && !java.util.Objects.equals(previousDeliveryDate, request.nextDeliveryDate());
        if (adminUserId != null && (oldStatus != entity.getStatus() || reportDateChanged)) {
            recordHistory(entity, adminUserId, oldStatus,
                    adminTransitionComment(oldStatus, newStatus, previousDriver, request.nextDeliveryDate()));
        }
        return toDto(packageRepository.save(entity));
    }

    /** Applies the status, assignee and audit effects as one atomic administrative transition. */
    private void applyAdminTransition(PackageEntity entity, PackageStatus oldStatus, PackageStatus newStatus,
            Long requestedDriverId) {
        if (newStatus == PackageStatus.ASSIGNED || newStatus == PackageStatus.IN_DELIVERY) {
            UserEntity driver = findDriver(requestedDriverId);
            if (driver == null) {
                throw new IllegalArgumentException("Un livreur est obligatoire pour un colis affecté ou en livraison.");
            }
            entity.setDriver(driver);
            entity.setLastDriver(driver);
        } else if (releasesDriver(newStatus)) {
            detachCurrentDriver(entity);
        } else if (requestedDriverId != null) {
            UserEntity driver = findDriver(requestedDriverId);
            entity.setDriver(driver);
            entity.setLastDriver(driver);
        }

        if (newStatus == PackageStatus.AT_AGENCY && oldStatus == PackageStatus.IN_DELIVERY) {
            entity.setReturnedToDepotAt(LocalDateTime.now());
            entity.setDepotDecisionAt(null);
        }
        if (newStatus == PackageStatus.IN_DELIVERY && oldStatus != PackageStatus.IN_DELIVERY) {
            entity.setDeliveryStartedAt(LocalDateTime.now());
        }
        if (newStatus == PackageStatus.DELIVERED && oldStatus != PackageStatus.DELIVERED) {
            if (oldStatus != PackageStatus.IN_DELIVERY || entity.getDriver() == null) {
                throw new IllegalArgumentException("Un colis ne peut être marqué livré que depuis une tournée en cours.");
            }
            recordDeliveredAttempt(entity, entity.getDriver(), "Livraison validée par l'administrateur");
        }
        entity.setStatus(newStatus);
    }

    private boolean releasesDriver(PackageStatus status) {
        return status == PackageStatus.TO_CONFIRM || status == PackageStatus.NO_ANSWER || status == PackageStatus.TO_RECEIVE
                || status == PackageStatus.AT_AGENCY || status == PackageStatus.TO_DELIVER
                || status == PackageStatus.RETURNED
                || status == PackageStatus.RETURN_SHIPPED || status == PackageStatus.CANCELLED;
    }

    private void detachCurrentDriver(PackageEntity entity) {
        if (entity.getDriver() != null) {
            entity.setLastDriver(entity.getDriver());
            entity.setDriver(null);
        }
    }

    private void recordDeliveredAttempt(PackageEntity entity, UserEntity driver, String comment) {
        DeliveryAttemptEntity attempt = new DeliveryAttemptEntity();
        attempt.setPackageEntity(entity);
        attempt.setDriver(driver);
        attempt.setResult(DeliveryResult.DELIVERED);
        attempt.setComment(comment);
        attempt.setCreatedAt(LocalDateTime.now());
        deliveryAttemptRepository.save(attempt);
    }

    private String adminTransitionComment(PackageStatus oldStatus, PackageStatus newStatus, UserEntity previousDriver,
            LocalDate nextDeliveryDate) {
        if (newStatus == PackageStatus.POSTPONED) {
            return "Livraison reportée au " + nextDeliveryDate;
        }
        if (newStatus == PackageStatus.TO_DELIVER && previousDriver != null) {
            return "Colis retiré de la tournée de " + previousDriver.getName() + " et remis à livrer";
        }
        if (newStatus == PackageStatus.AT_AGENCY && oldStatus == PackageStatus.IN_DELIVERY && previousDriver != null) {
            return "Colis retiré de la tournée de " + previousDriver.getName() + " et réceptionné en agence";
        }
        if (newStatus == PackageStatus.DELIVERED && previousDriver != null) {
            return "Livraison validée pour " + previousDriver.getName();
        }
        return "Statut modifié par l'administrateur : " + oldStatus + " → " + newStatus;
    }

    public PackageDto assignDriver(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.AT_AGENCY && entity.getStatus() != PackageStatus.POSTPONED
                && entity.getStatus() != PackageStatus.TO_DELIVER) {
            throw new IllegalArgumentException("Seul un colis en agence, reporte ou a livrer peut etre affecte.");
        }
        UserEntity driver = userService.getUser(driverId);
        entity.setDriver(driver);
        entity.setLastDriver(entity.getDriver());
        entity.setStatus(PackageStatus.ASSIGNED);
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto updateStatus(Long id, PackageStatus status) {
        PackageEntity entity = getPackage(id);
        if ((status == PackageStatus.ASSIGNED || status == PackageStatus.IN_DELIVERY) && entity.getDriver() == null) {
            throw new IllegalArgumentException("Un livreur est obligatoire pour un colis affecté ou en livraison.");
        }
        if (releasesDriver(status)) detachCurrentDriver(entity);
        if (status == PackageStatus.IN_DELIVERY && entity.getStatus() != PackageStatus.IN_DELIVERY) {
            entity.setDeliveryStartedAt(LocalDateTime.now());
        }
        entity.setStatus(status);
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto startDelivery(Long id) {
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.ASSIGNED || entity.getDriver() == null) {
            throw new IllegalArgumentException("Le package doit etre affecte avant sa sortie de tournee.");
        }
        entity.setStatus(PackageStatus.IN_DELIVERY);
        LocalDateTime now = LocalDateTime.now();
        entity.setDeliveryStartedAt(now);
        entity.setUpdatedAt(now);
        return toDto(packageRepository.save(entity));
    }

    public void confirmDriverDeparture(Long driverId) {
        List<PackageEntity> packages = packageRepository.findByDriverIdAndStatus(driverId, PackageStatus.ASSIGNED);
        if (packages.isEmpty()) {
            throw new IllegalArgumentException("Aucun colis affecte a confirmer pour ce livreur.");
        }
        LocalDateTime now = LocalDateTime.now();
        packages.forEach(entity -> {
            entity.setStatus(PackageStatus.IN_DELIVERY);
            entity.setDeliveryStartedAt(now);
            entity.setUpdatedAt(now);
        });
        packageRepository.saveAll(packages);
    }

    public PackageDto claimConfirmation(Long id, Long driverId) {
        PackageEntity entity = packageRepository.findByIdForConfirmationClaim(id)
                .orElseThrow(() -> new IllegalArgumentException("Package introuvable: " + id));
        LocalDateTime now = LocalDateTime.now();
        expireConfirmationClaimIfNeeded(entity, now);
        activateDueConfirmationReportIfNeeded(entity, now);
        activateDueDeliveryReportIfNeeded(entity, LocalDate.now(), now);
        if (entity.getNextConfirmationAt() != null && entity.getNextConfirmationAt().isAfter(now)) {
            throw new IllegalArgumentException("Ce rappel est programme pour le " + entity.getNextConfirmationAt() + ".");
        }
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.NO_ANSWER
                && entity.getStatus() != PackageStatus.AT_AGENCY) {
            throw new IllegalArgumentException("Ce colis n'est plus a confirmer.");
        }
        if (entity.getConfirmationDriver() != null && !entity.getConfirmationDriver().getId().equals(driverId)
                && entity.getStatus() != PackageStatus.NO_ANSWER) {
            throw new ConfirmationAlreadyClaimedException();
        }
        entity.setConfirmationDriver(userService.getUser(driverId));
        entity.setConfirmationClaimedAt(now);
        entity.setNextConfirmationAt(null);
        entity.setNextDeliveryDate(null);
        entity.setUpdatedAt(now);
        return toDto(packageRepository.save(entity));
    }

    public PackageDto releaseConfirmationClaim(Long id, Long driverId) {
        PackageEntity entity = packageRepository.findByIdForConfirmationClaim(id)
                .orElseThrow(() -> new IllegalArgumentException("Package introuvable: " + id));
        expireConfirmationClaimIfNeeded(entity, LocalDateTime.now());
        if (entity.getConfirmationDriver() == null || !entity.getConfirmationDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Seul le livreur ayant pris la confirmation peut l'abandonner.");
        }
        clearConfirmationClaim(entity);
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto recordConfirmationOutcome(Long id, Long driverId, ConfirmationOutcome outcome,
            String comment, LocalDateTime nextContactAt) {
        if (outcome == null) throw new IllegalArgumentException("Le resultat de confirmation est obligatoire.");
        if (outcome == ConfirmationOutcome.CALLBACK_REQUESTED && nextContactAt == null) {
            throw new IllegalArgumentException("Choisissez la date du report.");
        }
        PackageEntity entity = packageRepository.findByIdForConfirmationClaim(id)
                .orElseThrow(() -> new IllegalArgumentException("Package introuvable: " + id));
        expireConfirmationClaimIfNeeded(entity, LocalDateTime.now());
        if (entity.getConfirmationDriver() == null || !entity.getConfirmationDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Prenez d'abord en charge cet appel.");
        }
        PackageStatus oldStatus = entity.getStatus();
        if (outcome == ConfirmationOutcome.NO_ANSWER) entity.setStatus(PackageStatus.NO_ANSWER);
        if (outcome == ConfirmationOutcome.REFUSED) entity.setStatus(PackageStatus.CANCELLED);
        if (outcome == ConfirmationOutcome.CALLBACK_REQUESTED) entity.setStatus(PackageStatus.POSTPONED);
        entity.setNextConfirmationAt(outcome == ConfirmationOutcome.CALLBACK_REQUESTED ? nextContactAt : null);
        PackageHistoryEntity history = new PackageHistoryEntity();
        history.setPackageEntity(entity);
        history.setUser(userService.getUser(driverId));
        history.setOldStatus(oldStatus);
        history.setNewStatus(entity.getStatus());
        history.setComment(formatConfirmationOutcomeComment(outcome, comment, nextContactAt));
        history.setCreatedAt(LocalDateTime.now());
        packageHistoryRepository.save(history);
        if (outcome == ConfirmationOutcome.NO_ANSWER) {
            // Keep the follow-up with the same driver; the next call does not
            // require another claim. Another driver may still take it over.
            entity.setConfirmationClaimedAt(LocalDateTime.now());
        } else {
            clearConfirmationClaim(entity);
        }
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto confirmCustomer(Long id, Long driverId, String comment, String channel) {
        if (comment == null || comment.isBlank()) {
            throw new IllegalArgumentException("Le commentaire de confirmation est obligatoire.");
        }
        if (!"APPEL".equals(channel) && !"WHATSAPP".equals(channel)) {
            throw new IllegalArgumentException("Le canal de confirmation doit etre APPEL ou WHATSAPP.");
        }
        PackageEntity entity = packageRepository.findByIdForConfirmationClaim(id)
                .orElseThrow(() -> new IllegalArgumentException("Package introuvable: " + id));
        expireConfirmationClaimIfNeeded(entity, LocalDateTime.now());
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.NO_ANSWER
                && entity.getStatus() != PackageStatus.AT_AGENCY) {
            throw new IllegalArgumentException("Ce colis n'est plus a confirmer.");
        }
        if (entity.getConfirmationDriver() == null || !entity.getConfirmationDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Prenez d'abord en charge cet appel.");
        }
        PackageStatus oldStatus = entity.getStatus();
        entity.setConfirmationComment(comment.trim());
        entity.setConfirmationChannel(channel);
        entity.setStatus(entity.isAgencyReceived() ? PackageStatus.AT_AGENCY : PackageStatus.TO_RECEIVE);
        // Once the customer has confirmed, the confirmation task is complete.
        // Releasing the claim prevents it from being returned to the driver UI as still "taken".
        clearConfirmationClaim(entity);
        entity.setUpdatedAt(LocalDateTime.now());
        recordHistory(entity, driverId, oldStatus, "Confirmation client enregistrée par "
                + ("APPEL".equals(channel) ? "appel" : "WhatsApp") + " | " + comment.trim());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto updateConfirmationComment(Long id, Long driverId, String comment) {
        if (comment == null || comment.isBlank()) {
            throw new IllegalArgumentException("Le commentaire de confirmation est obligatoire.");
        }
        PackageEntity entity = getPackage(id);
        PackageHistoryEntity confirmationHistory = latestConfirmationHistory(entity);
        if (confirmationHistory == null || confirmationHistory.getUser() == null
                || !confirmationHistory.getUser().getId().equals(driverId)) {
            throw new AccessDeniedException("Seul le livreur qui a confirmé le client peut modifier ce commentaire.");
        }
        entity.setConfirmationComment(comment.trim());
        entity.setUpdatedAt(LocalDateTime.now());
        recordHistory(entity, driverId, entity.getStatus(), "Commentaire de confirmation modifié");
        return toDto(packageRepository.save(entity));
    }

    /** Reopens any completed confirmation result and reserves the correction for the acting driver. */
    public PackageDto reopenCancelledConfirmation(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        boolean canReopen = entity.getStatus() == PackageStatus.CANCELLED
                || entity.getStatus() == PackageStatus.NO_ANSWER
                || entity.getStatus() == PackageStatus.POSTPONED
                || entity.getConfirmationComment() != null && !entity.getConfirmationComment().isBlank();
        if (!canReopen || entity.getStatus() == PackageStatus.ASSIGNED || entity.getStatus() == PackageStatus.IN_DELIVERY
                || entity.getStatus() == PackageStatus.DELIVERED || entity.getStatus() == PackageStatus.RETURNED
                || entity.getStatus() == PackageStatus.RETURN_SHIPPED) {
            throw new IllegalArgumentException("Ce résultat de confirmation ne peut plus être modifié.");
        }
        PackageStatus oldStatus = entity.getStatus();
        entity.setStatus(entity.isAgencyReceived() ? PackageStatus.AT_AGENCY : PackageStatus.TO_CONFIRM);
        entity.setNextConfirmationAt(null);
        entity.setConfirmationComment(null);
        entity.setConfirmationChannel(null);
        entity.setConfirmationDriver(userService.getUser(driverId));
        entity.setConfirmationClaimedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        recordHistory(entity, driverId, oldStatus, "Résultat de confirmation rouvert par le livreur");
        return toDto(packageRepository.save(entity));
    }

    public PackageDto registerAgencyArrival(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        if (entity.isAgencyReceived()) {
            throw new IllegalArgumentException("Ce colis a deja ete recu en agence.");
        }
        boolean isConfirmationReport = entity.getStatus() == PackageStatus.POSTPONED
                && entity.getDriver() == null
                && entity.getNextConfirmationAt() != null;
        boolean isCancelled = entity.getStatus() == PackageStatus.CANCELLED;
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.NO_ANSWER
                && entity.getStatus() != PackageStatus.TO_RECEIVE
                && !isConfirmationReport && !isCancelled) {
            throw new IllegalArgumentException("Ce colis ne peut pas etre receptionne en agence.");
        }
        PackageStatus oldStatus = entity.getStatus();
        entity.setAgencyReceived(true);
        entity.setAgencyReceiverDriver(userService.getUser(driverId));
        // A parcel is only "at agency" after both physical reception and customer confirmation.
        // Keep the confirmed state when reception happens after confirmation; only an
        // unconfirmed parcel returns to the confirmation queue.
        entity.setStatus(isCancelled ? PackageStatus.CANCELLED : isConfirmationReport ? PackageStatus.POSTPONED
                : oldStatus == PackageStatus.NO_ANSWER ? PackageStatus.NO_ANSWER
                : entity.getConfirmationComment() != null && !entity.getConfirmationComment().isBlank()
                        ? PackageStatus.AT_AGENCY : PackageStatus.TO_CONFIRM);
        entity.setUpdatedAt(LocalDateTime.now());
        recordHistory(entity, driverId, oldStatus,
                isCancelled ? "Réception au dépôt (colis annulé)"
                        : isConfirmationReport ? "Réception en agence (rappel maintenu)"
                        : entity.getStatus() == PackageStatus.AT_AGENCY ? "Réception en agence (client déjà confirmé)"
                        : "Réception en agence (confirmation en attente)");
        return toDto(packageRepository.save(entity));
    }

    public PackageDto completeDeliveryForDriver(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        if (entity.getDriver() == null || !entity.getDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Ce package n'est pas affecte a ce livreur.");
        }
        return completeDelivery(id);
    }

    public PackageDto postponeDeliveryForDriver(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        if (entity.getDriver() == null || !entity.getDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Ce package n'est pas affecte a ce livreur.");
        }
        if (entity.getStatus() != PackageStatus.IN_DELIVERY) {
            throw new IllegalArgumentException("Le package doit etre en livraison avant d'etre reporte.");
        }
        entity.setStatus(PackageStatus.POSTPONED);
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto completeDelivery(Long id) {
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.IN_DELIVERY) {
            throw new IllegalArgumentException("Le package doit etre en livraison avant d'etre marque livre.");
        }
        entity.setStatus(PackageStatus.DELIVERED);
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto completeDeliveryFromAdmin(Long id, Long adminUserId) {
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.IN_DELIVERY || entity.getDriver() == null) {
            throw new IllegalArgumentException("Le colis doit être en livraison et affecté à un livreur.");
        }
        PackageStatus oldStatus = entity.getStatus();
        recordDeliveredAttempt(entity, entity.getDriver(), "Livraison validée par l'administrateur");
        entity.setStatus(PackageStatus.DELIVERED);
        entity.setUpdatedAt(LocalDateTime.now());
        recordHistory(entity, adminUserId, oldStatus, "Livraison validée pour " + entity.getDriver().getName());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto registerReturn(Long id) {
        return decideDepotStatus(id, PackageStatus.RETURNED, null);
    }

    public PackageDto registerDepotArrival(Long id) {
        return registerDepotArrival(id, null);
    }

    public PackageDto registerDepotArrival(Long id, Long adminId) {
        PackageEntity entity = getPackage(id);
        if (entity.getDriver() == null) {
            throw new IllegalArgumentException("Ce package n'est affecte a aucun livreur.");
        }
        if (entity.getStatus() != PackageStatus.IN_DELIVERY) {
            throw new IllegalArgumentException("Le package doit etre en livraison avant sa reception au depot.");
        }
        PackageStatus oldStatus = entity.getStatus();
        entity.setStatus(PackageStatus.AT_AGENCY);
        entity.setLastDriver(entity.getDriver());
        entity.setDriver(null);
        entity.setReturnedToDepotAt(LocalDateTime.now());
        entity.setDepotDecisionAt(null);
        entity.setUpdatedAt(LocalDateTime.now());
        if (adminId != null) recordHistory(entity, adminId, oldStatus, "Retour réceptionné au dépôt");
        return toDto(packageRepository.save(entity));
    }

    public PackageDto decideDepotStatus(Long id, PackageStatus status, LocalDate nextDeliveryDate) {
        return decideDepotStatus(id, status, nextDeliveryDate, null);
    }

    public PackageDto decideDepotStatus(Long id, PackageStatus status, LocalDate nextDeliveryDate, Long adminId) {
        if (status != PackageStatus.AT_AGENCY && status != PackageStatus.TO_DELIVER && status != PackageStatus.POSTPONED
                && status != PackageStatus.RETURNED) {
            throw new IllegalArgumentException("Decision de depot invalide.");
        }
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.AT_AGENCY || entity.getReturnedToDepotAt() == null
                || entity.getDepotDecisionAt() != null) {
            throw new IllegalArgumentException("Le colis doit d'abord etre réceptionné en agence comme retour.");
        }
        if (status == PackageStatus.POSTPONED && nextDeliveryDate == null) {
            throw new IllegalArgumentException("La nouvelle date de livraison est obligatoire pour un report.");
        }
        PackageStatus oldStatus = entity.getStatus();
        entity.setStatus(status);
        entity.setNextDeliveryDate(status == PackageStatus.POSTPONED ? nextDeliveryDate : null);
        entity.setDepotDecisionAt(status == PackageStatus.AT_AGENCY ? LocalDateTime.now() : null);
        if (status != PackageStatus.RETURNED) {
            entity.setDriver(null);
        }
        entity.setUpdatedAt(LocalDateTime.now());
        if (adminId != null) recordHistory(entity, adminId, oldStatus, depotDecisionComment(status, nextDeliveryDate));
        return toDto(packageRepository.save(entity));
    }

    public List<PackageDto> shipReturns(List<Long> packageIds, String reference) {
        return shipReturns(packageIds, reference, null);
    }

    public List<PackageDto> shipReturns(List<Long> packageIds, String reference, Long adminId) {
        if (packageIds == null || packageIds.isEmpty()) {
            throw new IllegalArgumentException("Scannez au moins un colis à retourner.");
        }
        LocalDateTime now = LocalDateTime.now();
        String shipmentReference = reference == null || reference.isBlank()
                ? "RET-" + now.format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"))
                : reference.trim();
        List<PackageEntity> entities = packageIds.stream().distinct().map(this::getPackage).toList();
        for (PackageEntity entity : entities) {
            if (entity.getStatus() != PackageStatus.RETURNED) {
                throw new IllegalArgumentException("Le colis " + entity.getTrackingCode() + " n'est pas en attente d'envoi.");
            }
            PackageStatus oldStatus = entity.getStatus();
            entity.setStatus(PackageStatus.RETURN_SHIPPED);
            entity.setReturnShipmentReference(shipmentReference);
            entity.setReturnedToCompanyAt(now);
            entity.setUpdatedAt(now);
            if (adminId != null) recordHistory(entity, adminId, oldStatus,
                    "Retour envoyé · Référence d’envoi : " + shipmentReference);
        }
        return packageRepository.saveAll(entities).stream().map(this::toDto).toList();
    }

    public void verifyAssignedToDriver(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        if (entity.getDriver() == null || !entity.getDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Ce package n'est pas affecte a ce livreur.");
        }
    }

    /** Allows a driver to read attempts only for a package visible in their workspace. */
    public void verifyDriverCanViewPackage(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        boolean isCurrentOrPreviousDriver = entity.getDriver() != null && entity.getDriver().getId().equals(driverId)
                || entity.getLastDriver() != null && entity.getLastDriver().getId().equals(driverId)
                || entity.getConfirmationDriver() != null && entity.getConfirmationDriver().getId().equals(driverId);
        boolean isSharedAgencyPackage = entity.getStatus() == PackageStatus.TO_CONFIRM
                || entity.getStatus() == PackageStatus.NO_ANSWER
                || entity.getStatus() == PackageStatus.TO_RECEIVE
                || entity.getStatus() == PackageStatus.AT_AGENCY
                || entity.getStatus() == PackageStatus.CANCELLED
                || entity.getStatus() == PackageStatus.POSTPONED && entity.getDriver() == null;
        if (!isCurrentOrPreviousDriver && !isSharedAgencyPackage) {
            throw new AccessDeniedException("Ce colis n'est pas accessible à ce livreur.");
        }
    }

    public void verifyInDeliveryForDriver(Long id, Long driverId) {
        verifyAssignedToDriver(id, driverId);
        if (getPackage(id).getStatus() != PackageStatus.IN_DELIVERY) {
            throw new IllegalArgumentException("Le package doit etre en livraison pour enregistrer une tentative.");
        }
    }

    public void delete(Long id) {
        PackageEntity entity = getPackage(id);
        deliveryAttemptRepository.deleteByPackageEntityId(id);
        packageHistoryRepository.deleteByPackageEntityId(id);
        packageRepository.delete(entity);
    }

    public PackageEntity getPackage(Long id) {
        return packageRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Package introuvable: " + id));
    }

    private UserEntity findDriver(Long driverId) {
        return driverId == null ? null : userService.getUser(driverId);
    }

    private PackageDto toDto(PackageEntity entity) {
        Long lastDriverId = entity.getLastDriver() == null ? null : entity.getLastDriver().getId();
        if (lastDriverId == null && entity.getStatus() == PackageStatus.RETURNED) {
            lastDriverId = deliveryAttemptRepository.findFirstByPackageEntityIdOrderByCreatedAtDesc(entity.getId())
                    .map(attempt -> attempt.getDriver().getId()).orElse(null);
        }
        ReportMetadata report = latestReportMetadata(entity);
        LocalDate nextDeliveryDate = entity.getNextDeliveryDate();
        if (nextDeliveryDate == null && entity.getStatus() == PackageStatus.POSTPONED) {
            nextDeliveryDate = deliveryAttemptRepository.findFirstByPackageEntityIdOrderByCreatedAtDesc(entity.getId())
                    .map(attempt -> attempt.getNextDate()).orElse(null);
        }
        LocalDate reportScheduledFor = nextDeliveryDate != null ? nextDeliveryDate
                : entity.getNextConfirmationAt() == null ? report.scheduledFor() : entity.getNextConfirmationAt().toLocalDate();
        PackageHistoryEntity confirmationHistory = entity.getConfirmationComment() == null || entity.getConfirmationComment().isBlank()
                ? null : latestConfirmationHistory(entity);
        LocalDateTime confirmedAt = confirmationHistory == null ? null : confirmationHistory.getCreatedAt();
        Long confirmedByDriverId = confirmationHistory == null ? null : confirmationHistory.getUser().getId();
        com.delivery.delivery_app.enums.DeliveryResult lastDeliveryResult = deliveryAttemptRepository
                .findFirstByPackageEntityIdOrderByCreatedAtDesc(entity.getId())
                .map(attempt -> attempt.getResult()).orElse(null);
        boolean confirmationClaimExpired = isConfirmationClaimExpired(entity, LocalDateTime.now());
        return new PackageDto(entity.getId(), entity.getTrackingCode(), entity.getRecipient(), entity.getPhone(),
                entity.getCity(), entity.getAddress(), entity.getPrice(), entity.getImportComment(),
                entity.getConfirmationComment(), latestActionComment(entity), entity.getConfirmationChannel(), confirmedAt,
                confirmedByDriverId,
                lastDeliveryResult,
                confirmationClaimExpired ? null : entity.getConfirmationClaimedAt(), entity.getNextConfirmationAt(), entity.getStatus(),
                entity.getDriver() == null ? null : entity.getDriver().getId(), lastDriverId,
                confirmationClaimExpired || entity.getConfirmationDriver() == null ? null : entity.getConfirmationDriver().getId(),
                entity.isAgencyReceived(), entity.getAgencyReceiverDriver() == null ? null : entity.getAgencyReceiverDriver().getId(),
                nextDeliveryDate, reportScheduledFor, report.reportedAt(), entity.getReturnedToDepotAt(), entity.getDeliveryStartedAt(), entity.getDepotDecisionAt(), entity.getReturnShipmentReference(), entity.getReturnedToCompanyAt(),
                entity.getCreatedAt(), entity.getUpdatedAt());
    }

    /**
     * Cards need the latest message actually written by an operator, regardless of
     * whether it was made during confirmation, cancellation, postponement or delivery.
     */
    private String latestActionComment(PackageEntity entity) {
        ActionComment latest = null;
        for (PackageHistoryEntity history : packageHistoryRepository
                .findByPackageEntityIdOrderByCreatedAtDesc(entity.getId())) {
            String comment = userWrittenHistoryComment(history.getComment(), entity.getConfirmationComment());
            if (comment != null && !comment.isBlank()
                    && (latest == null || history.getCreatedAt().isAfter(latest.createdAt()))) {
                latest = new ActionComment(comment, history.getCreatedAt());
            }
        }
        for (DeliveryAttemptEntity attempt : deliveryAttemptRepository
                .findByPackageEntityIdOrderByCreatedAtDesc(entity.getId())) {
            String comment = attempt.getComment();
            if (comment != null && !comment.isBlank()
                    && (latest == null || attempt.getCreatedAt().isAfter(latest.createdAt()))) {
                latest = new ActionComment(comment.trim(), attempt.getCreatedAt());
            }
        }
        return latest == null ? null : latest.comment();
    }

    private String userWrittenHistoryComment(String historyComment, String confirmationComment) {
        if (historyComment == null || historyComment.isBlank()) return null;
        if (historyComment.startsWith("Commentaire de confirmation modifié")) {
            return confirmationComment == null || confirmationComment.isBlank() ? null : confirmationComment.trim();
        }
        if (!historyComment.startsWith("CONFIRMATION_")
                && !historyComment.startsWith("Confirmation client enregistrée")) {
            return null;
        }
        String[] parts = historyComment.split("\\s*\\|\\s*");
        StringBuilder result = new StringBuilder();
        for (int index = 1; index < parts.length; index++) {
            if (parts[index].startsWith("Rappel:")) continue;
            if (!result.isEmpty()) result.append(" | ");
            result.append(parts[index]);
        }
        return result.isEmpty() ? null : result.toString().trim();
    }

    private record ActionComment(String comment, LocalDateTime createdAt) {
    }

    private ReportMetadata latestReportMetadata(PackageEntity entity) {
        ReportMetadata historyReport = packageHistoryRepository.findByPackageEntityIdOrderByCreatedAtDesc(entity.getId()).stream()
                .map(this::reportMetadataFromHistory)
                .filter(metadata -> metadata != null)
                .findFirst()
                .orElse(ReportMetadata.NONE);
        ReportMetadata deliveryReport = deliveryAttemptRepository.findByPackageEntityIdOrderByCreatedAtDesc(entity.getId()).stream()
                .filter(attempt -> attempt.getResult() == com.delivery.delivery_app.enums.DeliveryResult.CLIENT_REQUESTED_POSTPONEMENT
                        && attempt.getNextDate() != null)
                .map(attempt -> new ReportMetadata(attempt.getNextDate(), attempt.getCreatedAt()))
                .findFirst()
                .orElse(ReportMetadata.NONE);
        if (historyReport.reportedAt() == null) return deliveryReport;
        if (deliveryReport.reportedAt() == null || !deliveryReport.reportedAt().isAfter(historyReport.reportedAt())) {
            return historyReport;
        }
        return deliveryReport;
    }

    private PackageHistoryEntity latestConfirmationHistory(PackageEntity entity) {
        return packageHistoryRepository.findByPackageEntityIdOrderByCreatedAtDesc(entity.getId()).stream()
                .filter(history -> history.getComment() != null
                        && history.getComment().startsWith("Confirmation client enregistrée"))
                .findFirst()
                .orElse(null);
    }

    /** Restores only the latest legacy confirmation when it still matches the current package state. */
    private void restoreLatestConfirmationCommentIfNeeded(PackageEntity entity) {
        if (entity.getConfirmationComment() == null || entity.getConfirmationComment().isBlank()) return;
        packageHistoryRepository.findByPackageEntityIdOrderByCreatedAtDesc(entity.getId()).stream()
                .filter(history -> history.getComment() != null
                        && history.getComment().startsWith("Confirmation client enregistrée"))
                .findFirst()
                .filter(history -> !history.getComment().contains(" | ")
                        && history.getNewStatus() == entity.getStatus())
                .ifPresent(history -> history.setComment(history.getComment() + " | " + entity.getConfirmationComment().trim()));
    }

    private ReportMetadata reportMetadataFromHistory(PackageHistoryEntity history) {
        if (history.getNewStatus() != PackageStatus.POSTPONED) return null;
        LocalDateTime confirmationDate = confirmationReportDate(history);
        if (confirmationDate != null) return new ReportMetadata(confirmationDate.toLocalDate(), history.getCreatedAt());
        LocalDate deliveryDate = deliveryReportDate(history);
        return deliveryDate == null ? null : new ReportMetadata(deliveryDate, history.getCreatedAt());
    }

    private record ReportMetadata(LocalDate scheduledFor, LocalDateTime reportedAt) {
        private static final ReportMetadata NONE = new ReportMetadata(null, null);
    }

    private void expireConfirmationClaimIfNeeded(PackageEntity entity, LocalDateTime now) {
        if (isConfirmationClaimExpired(entity, now)) {
            clearConfirmationClaim(entity);
        }
    }

    private boolean isConfirmationClaimExpired(PackageEntity entity, LocalDateTime now) {
        return entity.getStatus() != PackageStatus.NO_ANSWER
                && entity.getConfirmationDriver() != null
                && (entity.getConfirmationClaimedAt() == null
                        || !entity.getConfirmationClaimedAt().plus(CONFIRMATION_CLAIM_DURATION).isAfter(now));
    }

    private void clearConfirmationClaim(PackageEntity entity) {
        entity.setConfirmationDriver(null);
        entity.setConfirmationClaimedAt(null);
    }

    private void recordHistory(PackageEntity entity, Long userId, PackageStatus oldStatus, String comment) {
        PackageHistoryEntity history = new PackageHistoryEntity();
        history.setPackageEntity(entity);
        history.setUser(userService.getUser(userId));
        history.setOldStatus(oldStatus);
        history.setNewStatus(entity.getStatus());
        history.setComment(comment);
        history.setCreatedAt(LocalDateTime.now());
        packageHistoryRepository.save(history);
    }

    private String depotDecisionComment(PackageStatus status, LocalDate nextDeliveryDate) {
        if (status == PackageStatus.POSTPONED) return "Livraison reportée au " + nextDeliveryDate;
        if (status == PackageStatus.AT_AGENCY) return "Colis conservé en agence";
        if (status == PackageStatus.RETURNED) return "Retour définitif décidé";
        return "Colis remis à livrer";
    }

    private void activateDueConfirmationReportIfNeeded(PackageEntity entity, LocalDateTime now) {
        if ((entity.getStatus() == PackageStatus.POSTPONED || entity.getStatus() == PackageStatus.AT_AGENCY)
                && entity.getDriver() == null
                && entity.getNextConfirmationAt() != null
                && !entity.getNextConfirmationAt().isAfter(now)) {
            if (entity.getStatus() == PackageStatus.POSTPONED) {
                entity.setStatus(PackageStatus.TO_CONFIRM);
            }
            entity.setUpdatedAt(now);
        }
    }

    /**
     * Repairs reports activated by earlier versions which cleared nextConfirmationAt
     * at midnight. Keeping the scheduled date for the current day lets the admin
     * and driver workspaces show the item in "Reportés aujourd'hui" until claimed.
     */
    private void restoreDueConfirmationReportDateIfNeeded(PackageEntity entity, LocalDate today) {
        if (entity.getStatus() != PackageStatus.TO_CONFIRM
                || entity.getNextConfirmationAt() != null
                || entity.getNextDeliveryDate() != null) {
            return;
        }
        packageHistoryRepository.findByPackageEntityIdOrderByCreatedAtDesc(entity.getId()).stream()
                .filter(history -> history.getNewStatus() == PackageStatus.POSTPONED)
                .map(this::confirmationReportDate)
                .filter(date -> date != null && date.toLocalDate().equals(today))
                .findFirst()
                .ifPresent(entity::setNextConfirmationAt);
    }

    private LocalDateTime confirmationReportDate(PackageHistoryEntity history) {
        String comment = history.getComment();
        if (comment == null) return null;
        Matcher matcher = CONFIRMATION_REPORT_DATE.matcher(comment);
        if (!matcher.find()) return null;
        try {
            return LocalDateTime.parse(matcher.group(1));
        } catch (java.time.format.DateTimeParseException ignored) {
            return null;
        }
    }

    private void restoreDueDeliveryReportDateIfNeeded(PackageEntity entity, LocalDate today) {
        if (entity.getStatus() != PackageStatus.TO_CONFIRM
                || entity.getNextConfirmationAt() != null
                || entity.getNextDeliveryDate() != null) {
            return;
        }
        packageHistoryRepository.findByPackageEntityIdOrderByCreatedAtDesc(entity.getId()).stream()
                .filter(history -> history.getNewStatus() == PackageStatus.POSTPONED)
                .map(this::deliveryReportDate)
                .filter(date -> date != null && date.equals(today))
                .findFirst()
                .ifPresent(entity::setNextDeliveryDate);
    }

    private LocalDate deliveryReportDate(PackageHistoryEntity history) {
        String comment = history.getComment();
        if (comment == null) return null;
        Matcher matcher = DELIVERY_REPORT_DATE.matcher(comment);
        if (!matcher.find()) return null;
        try {
            return LocalDate.parse(matcher.group(1));
        } catch (java.time.format.DateTimeParseException ignored) {
            return null;
        }
    }

    private void activateDueDeliveryReportIfNeeded(PackageEntity entity, LocalDate today, LocalDateTime now) {
        if (entity.getStatus() == PackageStatus.POSTPONED
                && entity.getDriver() == null
                && entity.getNextDeliveryDate() != null
                && !entity.getNextDeliveryDate().isAfter(today)) {
            entity.setStatus(PackageStatus.TO_CONFIRM);
            entity.setUpdatedAt(now);
        }
    }

    private String formatConfirmationOutcomeComment(ConfirmationOutcome outcome, String comment,
            LocalDateTime nextContactAt) {
        String result = "CONFIRMATION_" + outcome;
        if (nextContactAt != null) result += " | Rappel: " + nextContactAt;
        return comment == null || comment.isBlank() ? result : result + " | " + comment.trim();
    }
}
