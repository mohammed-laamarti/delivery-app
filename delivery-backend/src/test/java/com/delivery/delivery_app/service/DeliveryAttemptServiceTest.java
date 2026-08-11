package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.dto.DailyDeliveryStatsDto;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
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
        DeliveryAttemptService service = new DeliveryAttemptService(attemptRepository, packageRepository,
                mock(PackageService.class), mock(UserService.class));
        LocalDate date = LocalDate.of(2026, 8, 10);
        LocalDateTime from = date.atStartOfDay();

        when(attemptRepository.findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, from.plusDays(1)))
                .thenReturn(List.of(
                        attempt(1L, DeliveryResult.CLIENT_UNREACHABLE, from.plusHours(9)),
                        attempt(1L, DeliveryResult.DELIVERED, from.plusHours(11)),
                        attempt(2L, DeliveryResult.REFUSED, from.plusHours(10))));
        when(packageRepository.countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(from, from.plusDays(1))).thenReturn(4L);

        DailyDeliveryStatsDto stats = service.dailyStats(date);

        assertEquals(2, stats.attempts());
        assertEquals(1, stats.delivered());
        assertEquals(0, stats.unreachable());
        assertEquals(1, stats.refused());
    }

    private DeliveryAttemptEntity attempt(Long packageId, DeliveryResult result, LocalDateTime createdAt) {
        PackageEntity packageEntity = new PackageEntity();
        packageEntity.setId(packageId);
        DeliveryAttemptEntity attempt = new DeliveryAttemptEntity();
        attempt.setPackageEntity(packageEntity);
        attempt.setResult(result);
        attempt.setCreatedAt(createdAt);
        return attempt;
    }
}
