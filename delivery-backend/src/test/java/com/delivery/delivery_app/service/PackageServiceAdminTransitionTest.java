package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.dto.PackageRequest;
import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.PackageHistoryEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.enums.ConfirmationOutcome;
import com.delivery.delivery_app.enums.PackageStatus;
import org.springframework.security.access.AccessDeniedException;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
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

    @Test
    void adminReportAlwaysStoresTheScheduledDateInHistory() {
        TestContext context = context(PackageStatus.AT_AGENCY);
        ArgumentCaptor<PackageHistoryEntity> historyCaptor = ArgumentCaptor.forClass(PackageHistoryEntity.class);
        LocalDate scheduledDate = LocalDate.of(2026, 9, 3);

        context.service.update(42L, request(PackageStatus.POSTPONED, scheduledDate), 1L);

        verify(context.historyRepository).save(historyCaptor.capture());
        assertTrue(historyCaptor.getValue().getComment().startsWith("Livraison reportée au 2026-09-03"));
    }

    @Test
    void changingAnExistingReportDateCreatesAHistoryEntry() {
        TestContext context = context(PackageStatus.POSTPONED);
        context.packageEntity.setNextDeliveryDate(LocalDate.of(2026, 9, 3));
        ArgumentCaptor<PackageHistoryEntity> historyCaptor = ArgumentCaptor.forClass(PackageHistoryEntity.class);

        context.service.update(42L, request(PackageStatus.POSTPONED, LocalDate.of(2026, 9, 5)), 1L);

        verify(context.historyRepository).save(historyCaptor.capture());
        assertTrue(historyCaptor.getValue().getComment().startsWith("Livraison reportée au 2026-09-05"));
    }

    @Test
    void adminFieldChangesAreRecordedInOneHistoryEvent() {
        TestContext context = context(PackageStatus.TO_CONFIRM);
        ArgumentCaptor<PackageHistoryEntity> historyCaptor = ArgumentCaptor.forClass(PackageHistoryEntity.class);
        PackageRequest changedRequest = new PackageRequest("PKG-42", "Nouveau magasin", "Client", "0611111111",
                "Casablanca", "Nouvelle adresse", new BigDecimal("25.00"), "Fragile", 7L,
                PackageStatus.TO_CONFIRM, null, null);

        context.service.update(42L, changedRequest, 1L);

        verify(context.historyRepository).save(historyCaptor.capture());
        String comment = historyCaptor.getValue().getComment();
        assertTrue(comment.startsWith("Modification par l'administrateur"));
        assertTrue(comment.contains("Magasin : — → Nouveau magasin"));
        assertTrue(comment.contains("Téléphone : — → 0611111111"));
        assertTrue(comment.contains("Ville : — → Casablanca"));
        assertTrue(comment.contains("Adresse : — → Nouvelle adresse"));
        assertTrue(comment.contains("Prix : — → 25.00"));
        assertTrue(comment.contains("Commentaire import : — → Fragile"));
    }

    @Test
    void adminReceptionConfirmationStoresTheConfirmationComment() {
        TestContext context = context(PackageStatus.TO_CONFIRM);
        ArgumentCaptor<PackageHistoryEntity> historyCaptor = ArgumentCaptor.forClass(PackageHistoryEntity.class);
        PackageRequest confirmationRequest = new PackageRequest("PKG-42", "Magasin test", "Client", "0600000000",
                "Rabat", "Adresse", BigDecimal.TEN, null, 7L, PackageStatus.TO_RECEIVE, null,
                "Client confirmé par téléphone");

        context.service.update(42L, confirmationRequest, 1L);

        assertEquals(PackageStatus.TO_RECEIVE, context.packageEntity.getStatus());
        assertEquals("Client confirmé par téléphone", context.packageEntity.getConfirmationComment());
        assertEquals("ADMIN", context.packageEntity.getConfirmationChannel());
        verify(context.historyRepository).save(historyCaptor.capture());
        assertEquals("Confirmation client enregistrée par l'administrateur | Client confirmé par téléphone",
                historyCaptor.getValue().getComment());
    }

    @Test
    void unansweredFollowUpRemainsReservedForTheDriverWhoRecordedIt() {
        TestContext context = context(PackageStatus.TO_CONFIRM);
        context.packageEntity.setConfirmationDriver(context.packageEntity.getDriver());
        context.packageEntity.setConfirmationClaimedAt(java.time.LocalDateTime.now());

        context.service.recordConfirmationOutcome(42L, 7L, ConfirmationOutcome.NO_ANSWER, "", null);

        assertEquals(PackageStatus.NO_ANSWER, context.packageEntity.getStatus());
        assertEquals(7L, context.packageEntity.getConfirmationFollowUpDriver().getId());
        assertNull(context.packageEntity.getConfirmationDriver());
        assertThrows(AccessDeniedException.class, () -> context.service.reopenCancelledConfirmation(42L, 1L));
        assertDoesNotThrow(() -> context.service.recordConfirmationOutcome(42L, 7L,
                ConfirmationOutcome.VOICEMAIL, "", null));
        assertEquals(PackageStatus.VOICEMAIL, context.packageEntity.getStatus());
    }

    @Test
    void driverCanKeepAParcelInDistributionWithAnAttemptComment() {
        TestContext context = context(PackageStatus.TO_CONFIRM);
        context.packageEntity.setConfirmationDriver(context.packageEntity.getDriver());
        context.packageEntity.setConfirmationClaimedAt(java.time.LocalDateTime.now());
        ArgumentCaptor<DeliveryAttemptEntity> attemptCaptor = ArgumentCaptor.forClass(DeliveryAttemptEntity.class);

        context.service.recordConfirmationOutcome(42L, 7L, ConfirmationOutcome.IN_DISTRIBUTION,
                "Client injoignable, nouvelle tentative prévue", null);

        assertEquals(PackageStatus.TO_CONFIRM, context.packageEntity.getStatus());
        assertNull(context.packageEntity.getConfirmationFollowUpDriver());
        verify(context.attemptRepository).save(attemptCaptor.capture());
        assertEquals(DeliveryResult.CONFIRMATION_IN_DISTRIBUTION, attemptCaptor.getValue().getResult());
        assertEquals("Client injoignable, nouvelle tentative prévue", attemptCaptor.getValue().getComment());
        assertEquals(7L, attemptCaptor.getValue().getDriver().getId());
    }

    @Test
    void abandonedFollowUpBecomesAvailableForAnotherDriver() {
        TestContext context = context(PackageStatus.TO_CONFIRM);
        context.packageEntity.setConfirmationDriver(context.packageEntity.getDriver());
        context.packageEntity.setConfirmationClaimedAt(java.time.LocalDateTime.now());
        context.service.recordConfirmationOutcome(42L, 7L, ConfirmationOutcome.VOICEMAIL, "", null);

        context.service.releaseConfirmationClaim(42L, 7L);
        context.service.claimConfirmation(42L, 1L);

        assertNull(context.packageEntity.getConfirmationFollowUpDriver());
        assertEquals(PackageStatus.TO_CONFIRM, context.packageEntity.getStatus());
        assertEquals(1L, context.packageEntity.getConfirmationDriver().getId());
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
        when(packageRepository.findByIdForConfirmationClaim(42L)).thenReturn(Optional.of(packageEntity));
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
        return request(status, null);
    }

    private PackageRequest request(PackageStatus status, LocalDate nextDeliveryDate) {
        return new PackageRequest("PKG-42", "Magasin test", "Client", "0600000000", "Rabat", "Adresse",
                BigDecimal.TEN, null, 7L, status, nextDeliveryDate, null);
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
