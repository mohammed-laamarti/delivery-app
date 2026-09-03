package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.PackageHistoryEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

class PackageServiceReadPerformanceTest {
    @Test
    void packageListLoadsTimelineDataInTwoBulkQueries() {
        PackageRepository packageRepository = mock(PackageRepository.class);
        DeliveryAttemptRepository attemptRepository = mock(DeliveryAttemptRepository.class);
        PackageHistoryRepository historyRepository = mock(PackageHistoryRepository.class);
        PackageEntity first = packageEntity(1L, "PKG-1");
        PackageEntity second = packageEntity(2L, "PKG-2");

        when(packageRepository.findAllByOrderByCreatedAtDesc()).thenReturn(List.of(first, second));
        when(historyRepository.findByPackageEntityIdInOrderByCreatedAtDesc(anyCollection()))
                .thenReturn(List.<PackageHistoryEntity>of());
        when(attemptRepository.findByPackageEntityIdInOrderByCreatedAtDesc(anyCollection()))
                .thenReturn(List.<DeliveryAttemptEntity>of());

        PackageService service = new PackageService(packageRepository, attemptRepository, historyRepository,
                mock(UserService.class));

        assertEquals(2, service.findAll().size());
        verify(historyRepository).findByPackageEntityIdInOrderByCreatedAtDesc(anyCollection());
        verify(attemptRepository).findByPackageEntityIdInOrderByCreatedAtDesc(anyCollection());
        verify(historyRepository, never()).findByPackageEntityIdOrderByCreatedAtDesc(1L);
        verify(historyRepository, never()).findByPackageEntityIdOrderByCreatedAtDesc(2L);
        verify(attemptRepository, never()).findByPackageEntityIdOrderByCreatedAtDesc(1L);
        verify(attemptRepository, never()).findByPackageEntityIdOrderByCreatedAtDesc(2L);
        verify(attemptRepository, never()).findFirstByPackageEntityIdOrderByCreatedAtDesc(1L);
        verify(attemptRepository, never()).findFirstByPackageEntityIdOrderByCreatedAtDesc(2L);
    }

    private PackageEntity packageEntity(Long id, String trackingCode) {
        PackageEntity entity = new PackageEntity();
        entity.setId(id);
        entity.setTrackingCode(trackingCode);
        entity.setStatus(PackageStatus.DELIVERED);
        return entity;
    }
}
