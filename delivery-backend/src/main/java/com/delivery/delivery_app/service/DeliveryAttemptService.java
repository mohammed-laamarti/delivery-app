package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.DeliveryAttemptDto;
import com.delivery.delivery_app.dto.DeliveryAttemptRequest;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class DeliveryAttemptService {
    private final DeliveryAttemptRepository repository;
    private final PackageService packageService;
    private final UserService userService;

    public DeliveryAttemptService(DeliveryAttemptRepository repository, PackageService packageService,
            UserService userService) {
        this.repository = repository;
        this.packageService = packageService;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public List<DeliveryAttemptDto> findByPackage(Long packageId) {
        return repository.findByPackageEntityIdOrderByCreatedAtDesc(packageId).stream().map(this::toDto).toList();
    }

    public DeliveryAttemptDto create(DeliveryAttemptRequest request) {
        DeliveryAttemptEntity entity = new DeliveryAttemptEntity();
        entity.setPackageEntity(packageService.getPackage(request.packageId()));
        entity.setDriver(userService.getUser(request.driverId()));
        entity.setResult(request.result());
        entity.setComment(request.comment());
        entity.setNextDate(request.nextDate());
        entity.setCreatedAt(LocalDateTime.now());
        return toDto(repository.save(entity));
    }

    private DeliveryAttemptDto toDto(DeliveryAttemptEntity entity) {
        return new DeliveryAttemptDto(entity.getId(), entity.getPackageEntity().getId(), entity.getDriver().getId(),
                entity.getResult(), entity.getComment(), entity.getNextDate(), entity.getCreatedAt());
    }
}
