package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.dto.PackageRequest;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.exception.ConfirmationAlreadyClaimedException;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import com.delivery.delivery_app.entity.PackageHistoryEntity;
import com.delivery.delivery_app.enums.ConfirmationOutcome;
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
                        List.of(PackageStatus.TO_CONFIRM, PackageStatus.TO_RECEIVE),
                        PackageStatus.AT_AGENCY, PackageStatus.POSTPONED)
                .stream()
                .peek(entity -> {
                    restoreLatestConfirmationCommentIfNeeded(entity);
                    restoreDueConfirmationReportDateIfNeeded(entity, today);
                    restoreDueDeliveryReportDateIfNeeded(entity, today);
                    activateDueConfirmationReportIfNeeded(entity, now);
                    activateDueDeliveryReportIfNeeded(entity, today, now);
                })
                .map(this::toDto)
                // Delivery reports are shown on their requested date and the day before, for planning.
                .filter(item -> item.status() != PackageStatus.POSTPONED
                        || item.nextDeliveryDate() == null
                        || !item.nextDeliveryDate().isAfter(today.plusDays(1)))
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
        PackageEntity entity = getPackage(id);
        entity.setTrackingCode(request.trackingCode());
        entity.setRecipient(request.recipient());
        entity.setPhone(request.phone());
        entity.setCity(request.city());
        entity.setAddress(request.address());
        entity.setPrice(request.price());
        entity.setImportComment(request.importComment());
        entity.setDriver(findDriver(request.driverId()));
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
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
        entity.setUpdatedAt(LocalDateTime.now());
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
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.AT_AGENCY) {
            throw new IllegalArgumentException("Ce colis n'est plus a confirmer.");
        }
        if (entity.getConfirmationDriver() != null && !entity.getConfirmationDriver().getId().equals(driverId)) {
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
        clearConfirmationClaim(entity);
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
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.AT_AGENCY) {
            throw new IllegalArgumentException("Ce colis n'est plus a confirmer.");
        }
        if (entity.getConfirmationDriver() == null || !entity.getConfirmationDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Prenez d'abord en charge cet appel.");
        }
        PackageStatus oldStatus = entity.getStatus();
        entity.setConfirmationComment(comment.trim());
        entity.setConfirmationChannel(channel);
        entity.setStatus(entity.isAgencyReceived() ? PackageStatus.AT_AGENCY : PackageStatus.TO_RECEIVE);
        entity.setUpdatedAt(LocalDateTime.now());
        recordHistory(entity, driverId, oldStatus, "Confirmation client enregistrée par "
                + ("APPEL".equals(channel) ? "appel" : "WhatsApp") + " | " + comment.trim());
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
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.TO_RECEIVE
                && !isConfirmationReport) {
            throw new IllegalArgumentException("Ce colis ne peut pas etre receptionne en agence.");
        }
        PackageStatus oldStatus = entity.getStatus();
        entity.setAgencyReceived(true);
        entity.setAgencyReceiverDriver(userService.getUser(driverId));
        // A parcel is only "at agency" after both physical reception and customer confirmation.
        // A physical reception must not cancel a scheduled customer callback.
        entity.setStatus(isConfirmationReport ? PackageStatus.POSTPONED : PackageStatus.TO_CONFIRM);
        entity.setUpdatedAt(LocalDateTime.now());
        recordHistory(entity, driverId, oldStatus,
                isConfirmationReport ? "Réception en agence (rappel maintenu)" : "Réception en agence (confirmation en attente)");
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
        entity.setStatus(PackageStatus.AT_DEPOT);
        entity.setLastDriver(entity.getDriver());
        entity.setDriver(null);
        entity.setReturnedToDepotAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        if (adminId != null) recordHistory(entity, adminId, oldStatus, "Retour réceptionné au dépôt");
        return toDto(packageRepository.save(entity));
    }

    public PackageDto decideDepotStatus(Long id, PackageStatus status, LocalDate nextDeliveryDate) {
        return decideDepotStatus(id, status, nextDeliveryDate, null);
    }

    public PackageDto decideDepotStatus(Long id, PackageStatus status, LocalDate nextDeliveryDate, Long adminId) {
        if (status != PackageStatus.TO_DELIVER && status != PackageStatus.POSTPONED
                && status != PackageStatus.RETURNED) {
            throw new IllegalArgumentException("Decision de depot invalide.");
        }
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.AT_DEPOT) {
            throw new IllegalArgumentException("Le package doit d'abord etre receptionne au depot.");
        }
        if (status == PackageStatus.POSTPONED && nextDeliveryDate == null) {
            throw new IllegalArgumentException("La nouvelle date de livraison est obligatoire pour un report.");
        }
        PackageStatus oldStatus = entity.getStatus();
        entity.setStatus(status);
        entity.setNextDeliveryDate(status == PackageStatus.POSTPONED ? nextDeliveryDate : null);
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

    public void verifyInDeliveryForDriver(Long id, Long driverId) {
        verifyAssignedToDriver(id, driverId);
        if (getPackage(id).getStatus() != PackageStatus.IN_DELIVERY) {
            throw new IllegalArgumentException("Le package doit etre en livraison pour enregistrer une tentative.");
        }
    }

    public void delete(Long id) {
        packageRepository.delete(getPackage(id));
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
        LocalDateTime confirmedAt = latestConfirmationDate(entity);
        boolean confirmationClaimExpired = isConfirmationClaimExpired(entity, LocalDateTime.now());
        return new PackageDto(entity.getId(), entity.getTrackingCode(), entity.getRecipient(), entity.getPhone(),
                entity.getCity(), entity.getAddress(), entity.getPrice(), entity.getImportComment(),
                entity.getConfirmationComment(), entity.getConfirmationChannel(), confirmedAt,
                confirmationClaimExpired ? null : entity.getConfirmationClaimedAt(), entity.getNextConfirmationAt(), entity.getStatus(),
                entity.getDriver() == null ? null : entity.getDriver().getId(), lastDriverId,
                confirmationClaimExpired || entity.getConfirmationDriver() == null ? null : entity.getConfirmationDriver().getId(),
                entity.isAgencyReceived(), entity.getAgencyReceiverDriver() == null ? null : entity.getAgencyReceiverDriver().getId(),
                nextDeliveryDate, reportScheduledFor, report.reportedAt(), entity.getReturnedToDepotAt(), entity.getReturnShipmentReference(), entity.getReturnedToCompanyAt(),
                entity.getCreatedAt(), entity.getUpdatedAt());
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

    private LocalDateTime latestConfirmationDate(PackageEntity entity) {
        return packageHistoryRepository.findByPackageEntityIdOrderByCreatedAtDesc(entity.getId()).stream()
                .filter(history -> history.getComment() != null
                        && history.getComment().startsWith("Confirmation client enregistrée"))
                .map(PackageHistoryEntity::getCreatedAt)
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
        return entity.getConfirmationDriver() != null
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
