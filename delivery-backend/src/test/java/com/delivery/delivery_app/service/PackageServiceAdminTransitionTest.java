package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.dto.PackageRequest;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class PackageServiceAdminTransitionTest {
    @Test
    void returningPackageToDeliveryQueueRemovesItFromTheCurrentDriver() {
        TestContext context = context(PackageStatus.IN_DELIVERY);

        context.service.update(42L, request(PackageStatus.TO_DELIVER), 1L);

        assertEquals(PackageStatus.TO_DELIVER, context.packageEntity.getStatus());
        assertNull(context.packageEntity.getDriver());
        assertEquals("Mohammed", context.packageEntity.getLastDriver().getName());
        verify(context.historyRepository).save(any());
    }

    @Test
    void adminDeliveryRecordsTheCurrentDriverAsTheDeliverer() {
        TestContext context = context(PackageStatus.IN_DELIVERY);
        ArgumentCaptor<DeliveryAttemptEntity> attemptCaptor = ArgumentCaptor.forClass(DeliveryAttemptEntity.class);

        context.service.update(42L, request(PackageStatus.DELIVERED), 1L);

        verify(context.attemptRepository).save(attemptCaptor.capture());
        assertEquals(DeliveryResult.DELIVERED, attemptCaptor.getValue().getResult());
        assertEquals("Mohammed", attemptCaptor.getValue().getDriver().getName());
        assertEquals(PackageStatus.DELIVERED, context.packageEntity.getStatus());
    }

    @Test
    void cancelledPackageCanBeReceivedAtTheDepotWithoutBeingReactivated() {
        TestContext context = context(PackageStatus.CANCELLED);

        context.service.registerAgencyArrival(42L, 7L);

        assertTrue(context.packageEntity.isAgencyReceived());
        assertEquals(PackageStatus.CANCELLED, context.packageEntity.getStatus());
        assertEquals("Mohammed", context.packageEntity.getAgencyReceiverDriver().getName());
        verify(context.historyRepository).save(any());
    }

    @Test
    void driverCanReadAttemptsForSharedAgencyPackage() {
        TestContext context = context(PackageStatus.AT_AGENCY);

        assertDoesNotThrow(() -> context.service.verifyDriverCanViewPackage(42L, 1L));
    }

    private TestContext context(PackageStatus status) {
        PackageRepository packageRepository = mock(PackageRepository.class);
        DeliveryAttemptRepository attemptRepository = mock(DeliveryAttemptRepository.class);
        PackageHistoryRepository historyRepository = mock(PackageHistoryRepository.class);
        UserService userService = mock(UserService.class);
        PackageEntity packageEntity = new PackageEntity();
        packageEntity.setId(42L);
        packageEntity.setTrackingCode("PKG-42");
        packageEntity.setStatus(status);
        UserEntity mohammed = user(7L, "Mohammed");
        packageEntity.setDriver(mohammed);

        when(packageRepository.findById(42L)).thenReturn(Optional.of(packageEntity));
        when(packageRepository.findByTrackingCode("PKG-42")).thenReturn(Optional.of(packageEntity));
        when(packageRepository.save(any(PackageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(historyRepository.findByPackageEntityIdOrderByCreatedAtDesc(42L)).thenReturn(List.of());
        when(attemptRepository.findByPackageEntityIdOrderByCreatedAtDesc(42L)).thenReturn(List.of());
        when(attemptRepository.findFirstByPackageEntityIdOrderByCreatedAtDesc(42L)).thenReturn(Optional.empty());
        when(userService.getUser(1L)).thenReturn(user(1L, "Admin"));
        when(userService.getUser(7L)).thenReturn(mohammed);

        return new TestContext(packageEntity,
                new PackageService(packageRepository, attemptRepository, historyRepository, userService),
                attemptRepository, historyRepository);
    }

    private PackageRequest request(PackageStatus status) {
        return new PackageRequest("PKG-42", "Client", "0600000000", "Rabat", "Adresse",
                BigDecimal.TEN, null, 7L, status, null);
    }

    private UserEntity user(Long id, String name) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setName(name);
        return user;
    }

    private record TestContext(PackageEntity packageEntity, PackageService service,
            DeliveryAttemptRepository attemptRepository, PackageHistoryRepository historyRepository) {
    }
}
