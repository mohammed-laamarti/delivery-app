package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.dto.PackageRequest;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PackageService {
    private final PackageRepository packageRepository;
    private final DeliveryAttemptRepository deliveryAttemptRepository;
    private final UserService userService;

    public PackageService(PackageRepository packageRepository, DeliveryAttemptRepository deliveryAttemptRepository,
            UserService userService) {
        this.packageRepository = packageRepository;
        this.deliveryAttemptRepository = deliveryAttemptRepository;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public List<PackageDto> findAll() {
        return packageRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<PackageDto> findByDriver(Long driverId) {
        return packageRepository.findByDriverId(driverId).stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<PackageDto> findAllForDriver() {
        return packageRepository.findAllByOrderByCreatedAtDesc().stream().map(this::toDto).toList();
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
        if (entity.getStatus() != PackageStatus.AT_AGENCY && entity.getStatus() != PackageStatus.POSTPONED) {
            throw new IllegalArgumentException("Seul un colis en agence ou reporte peut etre affecte.");
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
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.AT_AGENCY) {
            throw new IllegalArgumentException("Ce colis n'est plus a confirmer.");
        }
        if (entity.getConfirmationDriver() != null && !entity.getConfirmationDriver().getId().equals(driverId)) {
            throw new IllegalArgumentException("Cet appel est deja pris en charge par un autre livreur.");
        }
        entity.setConfirmationDriver(userService.getUser(driverId));
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
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.AT_AGENCY) {
            throw new IllegalArgumentException("Ce colis n'est plus a confirmer.");
        }
        if (entity.getConfirmationDriver() == null || !entity.getConfirmationDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Prenez d'abord en charge cet appel.");
        }
        entity.setConfirmationComment(comment.trim());
        entity.setConfirmationChannel(channel);
        if (!entity.isAgencyReceived()) {
            entity.setStatus(PackageStatus.TO_RECEIVE);
        }
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto registerAgencyArrival(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        if (entity.isAgencyReceived()) {
            throw new IllegalArgumentException("Ce colis a deja ete recu en agence.");
        }
        if (entity.getStatus() != PackageStatus.TO_CONFIRM && entity.getStatus() != PackageStatus.TO_RECEIVE) {
            throw new IllegalArgumentException("Ce colis ne peut pas etre receptionne en agence.");
        }
        entity.setAgencyReceived(true);
        entity.setAgencyReceiverDriver(userService.getUser(driverId));
        entity.setStatus(PackageStatus.AT_AGENCY);
        entity.setUpdatedAt(LocalDateTime.now());
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
        return decideDepotStatus(id, PackageStatus.RETURNED);
    }

    public PackageDto registerDepotArrival(Long id) {
        PackageEntity entity = getPackage(id);
        if (entity.getDriver() == null) {
            throw new IllegalArgumentException("Ce package n'est affecte a aucun livreur.");
        }
        if (entity.getStatus() != PackageStatus.IN_DELIVERY) {
            throw new IllegalArgumentException("Le package doit etre en livraison avant sa reception au depot.");
        }
        entity.setStatus(PackageStatus.AT_DEPOT);
        entity.setLastDriver(entity.getDriver());
        entity.setDriver(null);
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto decideDepotStatus(Long id, PackageStatus status) {
        if (status != PackageStatus.TO_DELIVER && status != PackageStatus.POSTPONED
                && status != PackageStatus.RETURNED) {
            throw new IllegalArgumentException("Decision de depot invalide.");
        }
        PackageEntity entity = getPackage(id);
        if (entity.getStatus() != PackageStatus.AT_DEPOT) {
            throw new IllegalArgumentException("Le package doit d'abord etre receptionne au depot.");
        }
        entity.setStatus(status);
        if (status != PackageStatus.RETURNED) {
            entity.setDriver(null);
        }
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
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
        java.time.LocalDate nextDeliveryDate = entity.getStatus() == PackageStatus.POSTPONED
                ? deliveryAttemptRepository.findFirstByPackageEntityIdOrderByCreatedAtDesc(entity.getId())
                        .map(attempt -> attempt.getNextDate()).orElse(null)
                : null;
        return new PackageDto(entity.getId(), entity.getTrackingCode(), entity.getRecipient(), entity.getPhone(),
                entity.getCity(), entity.getAddress(), entity.getPrice(), entity.getImportComment(),
                entity.getConfirmationComment(), entity.getConfirmationChannel(), entity.getStatus(),
                entity.getDriver() == null ? null : entity.getDriver().getId(), lastDriverId,
                entity.getConfirmationDriver() == null ? null : entity.getConfirmationDriver().getId(),
                entity.isAgencyReceived(), entity.getAgencyReceiverDriver() == null ? null : entity.getAgencyReceiverDriver().getId(),
                nextDeliveryDate,
                entity.getCreatedAt(), entity.getUpdatedAt());
    }
}
