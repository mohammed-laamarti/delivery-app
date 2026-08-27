package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.DeliveryAttemptDto;
import com.delivery.delivery_app.dto.DeliveryAttemptRequest;
import com.delivery.delivery_app.dto.DailyDeliveryStatsDto;
import com.delivery.delivery_app.dto.DailyDriverStatsDto;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
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
        List<DeliveryAttemptEntity> packageResults = latestPackageResults(date);
        var from = date.atStartOfDay();
        var to = date.plusDays(1).atStartOfDay();
        long totalPackagesImported = packageRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to);
        return new DailyDeliveryStatsDto(date, totalPackagesImported, packageResults.size(), count(packageResults, DeliveryResult.DELIVERED),
                count(packageResults, DeliveryResult.CLIENT_UNREACHABLE) + count(packageResults, DeliveryResult.CLIENT_ABSENT), count(packageResults, DeliveryResult.CLIENT_REQUESTED_POSTPONEMENT),
                count(packageResults, DeliveryResult.REFUSED), count(packageResults, DeliveryResult.ADDRESS_NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public List<DailyDriverStatsDto> dailyDriverStats(LocalDate date) {
        return latestPackageResults(date).stream()
                .collect(java.util.stream.Collectors.groupingBy(attempt -> attempt.getDriver().getId()))
                .values().stream()
                .map(driverAttempts -> {
                    var driver = driverAttempts.getFirst().getDriver();
                    long delivered = count(driverAttempts, DeliveryResult.DELIVERED);
                    BigDecimal deliveredAmount = driverAttempts.stream()
                            .filter(attempt -> attempt.getResult() == DeliveryResult.DELIVERED)
                            .map(attempt -> attempt.getPackageEntity().getPrice())
                            .filter(java.util.Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    return new DailyDriverStatsDto(driver.getId(), driver.getName(), driverAttempts.size(), delivered, deliveredAmount);
                })
                .sorted(Comparator.comparing(DailyDriverStatsDto::driverName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public DeliveryAttemptDto create(DeliveryAttemptRequest request) {
        if (request.result() == null) {
            throw new IllegalArgumentException("Le resultat de la tentative est obligatoire.");
        }
        if ((request.result() == DeliveryResult.CLIENT_REQUESTED_POSTPONEMENT
                || request.result() == DeliveryResult.REFUSED
                || request.result() == DeliveryResult.ADDRESS_NOT_FOUND)
                && (request.comment() == null || request.comment().isBlank())) {
            throw new IllegalArgumentException("Un commentaire est obligatoire pour ce résultat.");
        }
        DeliveryAttemptEntity entity = new DeliveryAttemptEntity();
        entity.setPackageEntity(packageService.getPackage(request.packageId()));
        entity.setDriver(userService.getUser(request.driverId()));
        entity.setResult(request.result());
        entity.setComment(request.comment());
        entity.setNextDate(request.nextDate());
        entity.setCreatedAt(LocalDateTime.now());
        DeliveryAttemptDto attempt = toDto(repository.save(entity));
        if (request.result() == DeliveryResult.DELIVERED) {
            packageService.completeDeliveryForDriver(request.packageId(), request.driverId());
        }
        return attempt;
    }

    private DeliveryAttemptDto toDto(DeliveryAttemptEntity entity) {
        return new DeliveryAttemptDto(entity.getId(), entity.getPackageEntity().getId(), entity.getDriver().getId(), entity.getDriver().getName(),
                entity.getResult(), entity.getComment(), entity.getNextDate(), entity.getCreatedAt());
    }

    private long count(List<DeliveryAttemptEntity> attempts, DeliveryResult result) {
        return attempts.stream().filter(attempt -> attempt.getResult() == result).count();
    }

    private List<DeliveryAttemptEntity> latestPackageResults(LocalDate date) {
        var from = date.atStartOfDay();
        var to = date.plusDays(1).atStartOfDay();
        var attempts = repository.findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, to);
        Map<Long, DeliveryAttemptEntity> latestAttemptByPackage = attempts.stream()
                .collect(java.util.stream.Collectors.toMap(
                        attempt -> attempt.getPackageEntity().getId(),
                        attempt -> attempt,
                        java.util.function.BinaryOperator.maxBy(Comparator.comparing(DeliveryAttemptEntity::getCreatedAt))));
        return latestAttemptByPackage.values().stream().toList();
    }
}
