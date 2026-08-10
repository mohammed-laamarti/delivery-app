package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.dto.PackageRequest;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.PackageStatus;
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
    private final UserService userService;

    public PackageService(PackageRepository packageRepository, UserService userService) {
        this.packageRepository = packageRepository;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public List<PackageDto> findAll() {
        return packageRepository.findAll().stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public List<PackageDto> findByDriver(Long driverId) {
        return packageRepository.findByDriverId(driverId).stream().map(this::toDto).toList();
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
        PackageEntity entity = new PackageEntity();
        entity.setTrackingCode(request.trackingCode());
        entity.setRecipient(request.recipient());
        entity.setPhone(request.phone());
        entity.setCity(request.city());
        entity.setAddress(request.address());
        entity.setPrice(request.price());
        entity.setImportComment(request.importComment());
        entity.setStatus(PackageStatus.TO_DELIVER);
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
        entity.setDriver(userService.getUser(driverId));
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

    public PackageDto updateStatusForDriver(Long id, Long driverId, PackageStatus status) {
        PackageEntity entity = getPackage(id);
        if (entity.getDriver() == null || !entity.getDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Ce package n'est pas affecte a ce livreur.");
        }
        entity.setStatus(status);
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public PackageDto registerReturn(Long id) {
        PackageEntity entity = getPackage(id);
        if (entity.getDriver() == null) {
            throw new IllegalArgumentException("Ce package n'est affecte a aucun livreur.");
        }
        entity.setStatus(PackageStatus.RETURNED);
        entity.setDriver(null);
        entity.setUpdatedAt(LocalDateTime.now());
        return toDto(packageRepository.save(entity));
    }

    public void verifyAssignedToDriver(Long id, Long driverId) {
        PackageEntity entity = getPackage(id);
        if (entity.getDriver() == null || !entity.getDriver().getId().equals(driverId)) {
            throw new AccessDeniedException("Ce package n'est pas affecte a ce livreur.");
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
        return new PackageDto(entity.getId(), entity.getTrackingCode(), entity.getRecipient(), entity.getPhone(),
                entity.getCity(), entity.getAddress(), entity.getPrice(), entity.getImportComment(), entity.getStatus(),
                entity.getDriver() == null ? null : entity.getDriver().getId(), entity.getCreatedAt(), entity.getUpdatedAt());
    }
}
