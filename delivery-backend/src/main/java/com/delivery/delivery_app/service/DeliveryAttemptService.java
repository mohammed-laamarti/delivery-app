package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.DeliveryAttemptDto;
import com.delivery.delivery_app.dto.DeliveryAttemptRequest;
import com.delivery.delivery_app.dto.DailyDeliveryStatsDto;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class DeliveryAttemptService {
    private final DeliveryAttemptRepository repository;
    private final PackageRepository packageRepository;
    private final PackageService packageService;
    private final UserService userService;

    public DeliveryAttemptService(DeliveryAttemptRepository repository, PackageRepository packageRepository, PackageService packageService,
            UserService userService) {
        this.repository = repository;
        this.packageRepository = packageRepository;
        this.packageService = packageService;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public List<DeliveryAttemptDto> findByPackage(Long packageId) {
        return repository.findByPackageEntityIdOrderByCreatedAtDesc(packageId).stream().map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public DailyDeliveryStatsDto dailyStats(LocalDate date) {
        var from = date.atStartOfDay();
        var to = date.plusDays(1).atStartOfDay();
        var attempts = repository.findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to);
        long totalPackagesImported = packageRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to);
        return new DailyDeliveryStatsDto(date, totalPackagesImported, attempts.size(), count(attempts, DeliveryResult.DELIVERED),
                count(attempts, DeliveryResult.CLIENT_UNREACHABLE), count(attempts, DeliveryResult.CLIENT_REQUESTED_POSTPONEMENT),
                count(attempts, DeliveryResult.REFUSED), count(attempts, DeliveryResult.ADDRESS_NOT_FOUND));
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
        return new DeliveryAttemptDto(entity.getId(), entity.getPackageEntity().getId(), entity.getDriver().getId(), entity.getDriver().getName(),
                entity.getResult(), entity.getComment(), entity.getNextDate(), entity.getCreatedAt());
    }

    private long count(List<DeliveryAttemptEntity> attempts, DeliveryResult result) {
        return attempts.stream().filter(attempt -> attempt.getResult() == result).count();
    }
}
