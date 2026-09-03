package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.dto.DailyDeliveryStatsDto;
import com.delivery.delivery_app.dto.DriverDailyActivityDto;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.PackageHistoryEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class DeliveryAttemptServiceTest {
    @Test
    void dailyStatsCountsOnlyTheLatestAttemptForEachPackage() {
        DeliveryAttemptRepository attemptRepository = mock(DeliveryAttemptRepository.class);
        PackageRepository packageRepository = mock(PackageRepository.class);
        DeliveryAttemptService service = new DeliveryAttemptService(attemptRepository, mock(PackageHistoryRepository.class), packageRepository,
                mock(PackageService.class), mock(UserService.class));
        LocalDate date = LocalDate.of(2026, 8, 10);
        LocalDateTime from = date.atStartOfDay();

        when(attemptRepository.findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, from.plusDays(1)))
                .thenReturn(List.of(
                        attempt(1L, DeliveryResult.CLIENT_UNREACHABLE, from.plusHours(9)),
                        attempt(1L, DeliveryResult.DELIVERED, from.plusHours(11)),
                        attempt(2L, DeliveryResult.REFUSED, from.plusHours(10)),
                        attempt(3L, DeliveryResult.CONFIRMATION_IN_DISTRIBUTION, from.plusHours(12))));
        when(packageRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, from.plusDays(1))).thenReturn(4L);

        DailyDeliveryStatsDto stats = service.dailyStats(date);

        assertEquals(3, stats.attempts());
        assertEquals(1, stats.delivered());
        assertEquals(0, stats.unreachable());
        assertEquals(1, stats.refused());
    }

    @Test
    void driverDailyActivityIncludesConfirmationAndDeliveryResultsForThatDay() {
        DeliveryAttemptRepository attemptRepository = mock(DeliveryAttemptRepository.class);
        PackageHistoryRepository historyRepository = mock(PackageHistoryRepository.class);
        PackageService packageService = mock(PackageService.class);
        DeliveryAttemptService service = new DeliveryAttemptService(attemptRepository, historyRepository, mock(PackageRepository.class),
                packageService, mock(UserService.class));
        LocalDate date = LocalDate.of(2026, 8, 10);
        LocalDateTime from = date.atStartOfDay();

        when(attemptRepository.findByDriverIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(7L, from, from.plusDays(1)))
                .thenReturn(List.of(
                        attempt(1L, DeliveryResult.CLIENT_UNREACHABLE, from.plusHours(9)),
                        attempt(1L, DeliveryResult.DELIVERED, from.plusHours(11)),
                        attempt(2L, DeliveryResult.CLIENT_ABSENT, from.plusHours(10))));
        when(historyRepository.findByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(7L, from, from.plusDays(1)))
                .thenReturn(List.of(history(3L, PackageStatus.NO_ANSWER, from.plusHours(8))));

        List<DriverDailyActivityDto> activity = service.findDriverDailyActivity(7L, date);

        assertEquals(3, activity.size());
        assertEquals(PackageStatus.DELIVERED, activity.get(0).activityStatus());
        assertEquals(PackageStatus.NO_ANSWER, activity.get(1).activityStatus());
        assertEquals(PackageStatus.NO_ANSWER, activity.get(2).activityStatus());
    }

    @Test
    void driverDailyActivityIncludesParcelsStillInDeliveryWithoutAnAttempt() {
        DeliveryAttemptRepository attemptRepository = mock(DeliveryAttemptRepository.class);
        PackageHistoryRepository historyRepository = mock(PackageHistoryRepository.class);
        PackageRepository packageRepository = mock(PackageRepository.class);
        PackageService packageService = mock(PackageService.class);
        DeliveryAttemptService service = new DeliveryAttemptService(attemptRepository, historyRepository, packageRepository,
                packageService, mock(UserService.class));
        LocalDate date = LocalDate.of(2026, 8, 10);
        LocalDateTime from = date.atStartOfDay();
        PackageEntity activePackage = new PackageEntity();
        activePackage.setId(4L);
        activePackage.setDeliveryStartedAt(from.plusHours(8));

        when(packageRepository.findByDriverIdAndStatusAndDeliveryStartedAtGreaterThanEqualAndDeliveryStartedAtLessThan(
                7L, PackageStatus.IN_DELIVERY, from, from.plusDays(1))).thenReturn(List.of(activePackage));

        List<DriverDailyActivityDto> activity = service.findDriverDailyActivity(7L, date);

        assertEquals(1, activity.size());
        assertEquals(PackageStatus.IN_DELIVERY, activity.getFirst().activityStatus());
        verify(packageRepository).findByDriverIdAndStatusAndDeliveryStartedAtGreaterThanEqualAndDeliveryStartedAtLessThan(
                7L, PackageStatus.IN_DELIVERY, from, from.plusDays(1));
    }

    private DeliveryAttemptEntity attempt(Long packageId, DeliveryResult result, LocalDateTime createdAt) {
        PackageEntity packageEntity = new PackageEntity();
        packageEntity.setId(packageId);
        DeliveryAttemptEntity attempt = new DeliveryAttemptEntity();
        attempt.setPackageEntity(packageEntity);
        UserEntity driver = new UserEntity();
        driver.setId(7L);
        attempt.setDriver(driver);
        attempt.setResult(result);
        attempt.setCreatedAt(createdAt);
        return attempt;
    }

    private PackageHistoryEntity history(Long packageId, PackageStatus status, LocalDateTime createdAt) {
        PackageEntity packageEntity = new PackageEntity();
        packageEntity.setId(packageId);
        PackageHistoryEntity history = new PackageHistoryEntity();
        history.setPackageEntity(packageEntity);
        history.setNewStatus(status);
        history.setCreatedAt(createdAt);
        return history;
    }
}
