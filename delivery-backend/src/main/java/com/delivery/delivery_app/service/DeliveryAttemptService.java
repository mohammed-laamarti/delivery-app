package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.DeliveryAttemptDto;
import com.delivery.delivery_app.dto.DeliveryAttemptRequest;
import com.delivery.delivery_app.dto.DailyDeliveryStatsDto;
import com.delivery.delivery_app.dto.DailyDriverStatsDto;
import com.delivery.delivery_app.dto.DriverDailyActivityDto;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
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
    private final PackageHistoryRepository packageHistoryRepository;
    private final PackageRepository packageRepository;
    private final PackageService packageService;
    private final UserService userService;

    public DeliveryAttemptService(DeliveryAttemptRepository repository, PackageHistoryRepository packageHistoryRepository,
            PackageRepository packageRepository, PackageService packageService,
            UserService userService) {
        this.repository = repository;
        this.packageHistoryRepository = packageHistoryRepository;
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
                    // A delivery attempt is historical. If an administrator corrects
                    // the parcel back to the agency, it must immediately stop
                    // contributing to the driver's delivered count and earnings.
                    var currentDeliveries = driverAttempts.stream()
                            .filter(attempt -> attempt.getResult() == DeliveryResult.DELIVERED
                                    && attempt.getPackageEntity().getStatus() == PackageStatus.DELIVERED)
                            .toList();
                    long delivered = currentDeliveries.size();
                    BigDecimal deliveredAmount = currentDeliveries.stream()
                            .map(attempt -> attempt.getPackageEntity().getPrice())
                            .filter(java.util.Objects::nonNull)
                            .reduce(BigDecimal.ZERO, BigDecimal::add);
                    return new DailyDriverStatsDto(driver.getId(), driver.getName(), driverAttempts.size(), delivered, deliveredAmount);
                })
                .sorted(Comparator.comparing(DailyDriverStatsDto::driverName, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /**
     * Returns the latest confirmation or delivery result for each parcel that this
     * driver handled on the requested day. The current package status is deliberately
     * not used as a date filter: it may have changed on a later day.
     */
    @Transactional(readOnly = true)
    public List<DriverDailyActivityDto> findDriverDailyActivity(Long driverId, LocalDate date) {
        LocalDateTime from = date.atStartOfDay();
        LocalDateTime to = date.plusDays(1).atStartOfDay();
        List<DriverPackageActivity> activities = new java.util.ArrayList<>();
        repository.findByDriverIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(driverId, from, to).forEach(attempt ->
                activities.add(new DriverPackageActivity(attempt.getPackageEntity().getId(),
                        statusForDeliveryResult(attempt.getResult()), attempt.getCreatedAt())));
        packageHistoryRepository.findByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(driverId, from, to).forEach(history ->
                activities.add(new DriverPackageActivity(history.getPackageEntity().getId(),
                        history.getNewStatus(), history.getCreatedAt())));
        // A parcel can remain in delivery without a new call, delivery result or
        // history entry. Add it explicitly so the detail page contains the same
        // "En cours" parcels as the driver's summary card.
        packageRepository.findByDriverIdAndStatusAndDeliveryStartedAtGreaterThanEqualAndDeliveryStartedAtLessThan(
                        driverId, PackageStatus.IN_DELIVERY, from, to)
                .forEach(packageEntity -> activities.add(new DriverPackageActivity(packageEntity.getId(),
                        PackageStatus.IN_DELIVERY, packageEntity.getDeliveryStartedAt())));

        return activities.stream()
                .collect(java.util.stream.Collectors.toMap(
                        DriverPackageActivity::packageId,
                        activity -> activity,
                        java.util.function.BinaryOperator.maxBy(Comparator.comparing(DriverPackageActivity::occurredAt))))
                .values().stream()
                .sorted(Comparator.comparing(DriverPackageActivity::occurredAt).reversed())
                .map(activity -> new DriverDailyActivityDto(packageService.findById(activity.packageId()),
                        activity.status(), activity.occurredAt()))
                .toList();
    }

    private PackageStatus statusForDeliveryResult(DeliveryResult result) {
        return switch (result) {
            case CONFIRMATION_IN_DISTRIBUTION -> PackageStatus.TO_CONFIRM;
            case CLIENT_CONFIRMED -> PackageStatus.TO_DELIVER;
            case CLIENT_ABSENT, CLIENT_UNREACHABLE -> PackageStatus.NO_ANSWER;
            case ADDRESS_NOT_FOUND -> PackageStatus.OUT_OF_ZONE;
            case CLIENT_REQUESTED_POSTPONEMENT -> PackageStatus.POSTPONED;
            case DELIVERED -> PackageStatus.DELIVERED;
            case REFUSED -> PackageStatus.RETURNED;
            case RETURNED_TO_DEPOT -> PackageStatus.AT_AGENCY;
        };
    }

    private record DriverPackageActivity(Long packageId, PackageStatus status, LocalDateTime occurredAt) {}

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
