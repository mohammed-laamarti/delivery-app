package com.delivery.delivery_app.service;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

class PackageServiceBulkDeleteTest {
    @Test
    void deletesEachSelectedPackageAndItsRelatedData() {
        PackageRepository packageRepository = mock(PackageRepository.class);
        DeliveryAttemptRepository deliveryAttemptRepository = mock(DeliveryAttemptRepository.class);
        PackageHistoryRepository packageHistoryRepository = mock(PackageHistoryRepository.class);
        UserService userService = mock(UserService.class);
        PackageEntity first = new PackageEntity();
        first.setId(4L);
        PackageEntity second = new PackageEntity();
        second.setId(9L);
        when(packageRepository.findAllById(List.of(4L, 9L))).thenReturn(List.of(first, second));
        PackageService service = new PackageService(packageRepository, deliveryAttemptRepository, packageHistoryRepository, userService);

        service.deleteAll(List.of(4L, 9L));

        verify(deliveryAttemptRepository).deleteByPackageEntityId(4L);
        verify(deliveryAttemptRepository).deleteByPackageEntityId(9L);
        verify(packageHistoryRepository).deleteByPackageEntityId(4L);
        verify(packageHistoryRepository).deleteByPackageEntityId(9L);
        verify(packageRepository).deleteAll(List.of(first, second));
    }
}
