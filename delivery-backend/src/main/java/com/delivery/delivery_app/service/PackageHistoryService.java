package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.PackageHistoryDto;
import com.delivery.delivery_app.dto.PackageHistoryRequest;
import com.delivery.delivery_app.entity.PackageHistoryEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class PackageHistoryService {
    private final PackageHistoryRepository repository;
    private final PackageService packageService;
    private final UserService userService;

    public PackageHistoryService(PackageHistoryRepository repository, PackageService packageService,
            UserService userService) {
        this.repository = repository;
        this.packageService = packageService;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public List<PackageHistoryDto> findByPackage(Long packageId) {
        return repository.findByPackageEntityIdOrderByCreatedAtDesc(packageId).stream().map(this::toDto).toList();
    }

    public PackageHistoryDto create(PackageHistoryRequest request, PackageStatus newStatus) {
        var packageEntity = packageService.getPackage(request.packageId());
        PackageHistoryEntity entity = new PackageHistoryEntity();
        entity.setPackageEntity(packageEntity);
        entity.setUser(userService.getUser(request.userId()));
        entity.setOldStatus(packageEntity.getStatus());
        entity.setNewStatus(newStatus);
        entity.setComment(request.comment());
        entity.setCreatedAt(LocalDateTime.now());
        packageEntity.setStatus(newStatus);
        packageService.updateStatus(packageEntity.getId(), newStatus);
        return toDto(repository.save(entity));
    }

    private PackageHistoryDto toDto(PackageHistoryEntity entity) {
        return new PackageHistoryDto(entity.getId(), entity.getPackageEntity().getId(), entity.getUser().getId(),
                entity.getOldStatus(), entity.getNewStatus(), entity.getComment(), entity.getCreatedAt());
    }
}
