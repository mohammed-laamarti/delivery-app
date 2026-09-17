package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.PackageHistoryEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.enums.DriverWorkspaceDateFilter;
import com.delivery.delivery_app.enums.DriverWorkspaceFilter;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.enums.Role;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageHistoryRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import com.delivery.delivery_app.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class DriverAssignedPackagesTest {
    @Autowired private PackageRepository packages;
    @Autowired private UserRepository users;
    @Autowired private DeliveryAttemptRepository attempts;
    @Autowired private PackageHistoryRepository histories;
    @Autowired private DeliveryAttemptService service;
    @Autowired private PackageService packageService;

    @Test
    void readingAnAgencyPackageWithAnExpiredReminderDoesNotModifyIt() {
        LocalDateTime originalUpdate = LocalDate.of(2026, 9, 4).atStartOfDay();
        PackageEntity agencyPackage = parcel("AGENCY-REMINDER", null, null, PackageStatus.AT_AGENCY);
        agencyPackage.setNextConfirmationAt(LocalDateTime.now().minusDays(1));
        agencyPackage.setUpdatedAt(originalUpdate);
        packages.flush();

        packageService.findAll();

        assertEquals(PackageStatus.AT_AGENCY, agencyPackage.getStatus());
        assertEquals(originalUpdate, agencyPackage.getUpdatedAt());
    }

    @Test
    void listsOnlyTheSelectedDriversAssignmentsWithinTheSelectedDay() {
        LocalDate day = LocalDate.of(2026, 9, 5);
        LocalDateTime start = day.atStartOfDay();
        UserEntity driver = driver("Livreur A");
        UserEntity other = driver("Livreur B");
        parcel("MIDNIGHT", driver, start, PackageStatus.ASSIGNED);
        parcel("IN-PROGRESS", driver, start.plusHours(8), PackageStatus.IN_DELIVERY);
        PackageEntity delivered = parcel("DELIVERED", driver, start.plusHours(9), PackageStatus.DELIVERED);
        delivered.setUpdatedAt(start.plusDays(2));
        delivery(delivered, driver, start.plusHours(11));
        PackageEntity assignedYesterdayDeliveredToday = parcel(
                "ASSIGNED-YESTERDAY-DELIVERED-TODAY", driver, start.minusDays(1), PackageStatus.DELIVERED);
        assignedYesterdayDeliveredToday.setUpdatedAt(start.plusHours(12));
        delivery(assignedYesterdayDeliveredToday, driver, start.plusHours(12));
        parcel("PREVIOUS-DAY", driver, start.minusNanos(1_000_000), PackageStatus.IN_DELIVERY);
        parcel("NEXT-DAY", driver, start.plusDays(1), PackageStatus.ASSIGNED);
        PackageEntity otherAssignment = parcel("OTHER-DRIVER", other, start.plusHours(9), PackageStatus.IN_DELIVERY);
        otherAssignment.setConfirmationDriver(driver);
        PackageEntity confirmationOnly = parcel("CONFIRMATION-ONLY", null, null, PackageStatus.TO_DELIVER);
        confirmationOnly.setConfirmationDriver(driver);
        confirmationOnly.setLastDriver(driver);
        confirmationOnly.setDeliveryStartedAt(start.plusHours(7));
        confirmationOnly.setUpdatedAt(start.plusHours(10));
        for (PackageEntity parcel : new PackageEntity[] { confirmationOnly, otherAssignment }) {
            DeliveryAttemptEntity attempt = new DeliveryAttemptEntity();
            attempt.setPackageEntity(parcel);
            attempt.setDriver(driver);
            attempt.setResult(DeliveryResult.CLIENT_CONFIRMED);
            attempt.setCreatedAt(start.plusHours(10));
            attempts.save(attempt);
            PackageHistoryEntity history = new PackageHistoryEntity();
            history.setPackageEntity(parcel);
            history.setUser(driver);
            history.setNewStatus(PackageStatus.TO_DELIVER);
            history.setCreatedAt(start.plusHours(10));
            histories.save(history);
        }
        // A confirmation handled by someone else does not remove a real assignment.
        delivered.setConfirmationDriver(other);
        packages.flush();

        var result = service.findDriverDailyActivity(driver.getId(), day);

        assertEquals(Set.of("MIDNIGHT", "IN-PROGRESS", "DELIVERED", "ASSIGNED-YESTERDAY-DELIVERED-TODAY"), result.stream()
                .map(item -> item.packageData().trackingCode()).collect(Collectors.toSet()));
        assertEquals("ASSIGNED-YESTERDAY-DELIVERED-TODAY", result.getFirst().packageData().trackingCode());
        assertEquals(1, service.findDriverDailyActivity(driver.getId(), day.plusDays(1)).size());
        assertTrue(service.findDriverDailyActivity(driver.getId(), day.plusDays(3)).isEmpty());
    }

    private void delivery(PackageEntity parcel, UserEntity driver, LocalDateTime deliveredAt) {
        DeliveryAttemptEntity attempt = new DeliveryAttemptEntity();
        attempt.setPackageEntity(parcel);
        attempt.setDriver(driver);
        attempt.setResult(DeliveryResult.DELIVERED);
        attempt.setCreatedAt(deliveredAt);
        attempts.save(attempt);
    }

    @Test
    void existingParcelsUseTheTourDateBeforeFallingBackToTheirLastUpdate() {
        LocalDate day = LocalDate.of(2026, 9, 5);
        LocalDateTime start = day.atStartOfDay();
        UserEntity driver = driver("Ancien livreur");
        PackageEntity touring = parcel("LEGACY-TOUR", driver, null, PackageStatus.DELIVERED);
        touring.setDeliveryStartedAt(start.plusHours(8));
        touring.setUpdatedAt(start.plusDays(1));
        PackageEntity assigned = parcel("LEGACY-ASSIGNED", driver, null, PackageStatus.ASSIGNED);
        assigned.setUpdatedAt(start.plusHours(9));
        PackageEntity oldTour = parcel("LEGACY-OLD", driver, null, PackageStatus.IN_DELIVERY);
        oldTour.setDeliveryStartedAt(start.minusDays(1));
        oldTour.setUpdatedAt(start.plusHours(10));
        packages.flush();

        assertEquals(Set.of("LEGACY-TOUR", "LEGACY-ASSIGNED"), service.findDriverDailyActivity(driver.getId(), day)
                .stream().map(item -> item.packageData().trackingCode()).collect(Collectors.toSet()));
    }

    @Test
    void includesDepotReturnsForThisDriverAndDayWithoutDuplicatesOrConfirmationOnlyParcels() {
        LocalDate day = LocalDate.of(2026, 9, 5);
        LocalDateTime start = day.atStartOfDay();
        UserEntity driver = driver("Livreur retours");
        UserEntity other = driver("Autre livreur retours");
        parcel("ASSIGNED", driver, start.plusHours(8), PackageStatus.ASSIGNED);
        depotReturn("AT-AGENCY", driver, start, PackageStatus.AT_AGENCY);
        depotReturn("RETURNED", driver, start.plusHours(14), PackageStatus.RETURNED);
        PackageEntity postponed = depotReturn("POSTPONED", driver, start.plusHours(15), PackageStatus.POSTPONED);
        postponed.setUpdatedAt(start.plusDays(2));
        PackageEntity both = depotReturn("BOTH", driver, start.plusHours(16), PackageStatus.ASSIGNED);
        both.setDriver(driver);
        both.setAssignedAt(start.plusHours(17));
        depotReturn("OTHER-RETURN", other, start.plusHours(15), PackageStatus.RETURNED);
        depotReturn("PREVIOUS-RETURN", driver, start.minusNanos(1_000_000), PackageStatus.RETURNED);
        depotReturn("NEXT-RETURN", driver, start.plusDays(1), PackageStatus.RETURNED);
        // A return status or confirmation alone is not proof of a depot return by this driver.
        PackageEntity statusOnly = parcel("STATUS-ONLY", null, null, PackageStatus.RETURNED);
        statusOnly.setLastDriver(driver);
        statusOnly.setConfirmationDriver(driver);
        statusOnly.setUpdatedAt(start.plusHours(12));
        packages.flush();

        var result = service.findDriverDailyActivity(driver.getId(), day);

        assertEquals(5, result.size());
        assertEquals(Set.of("ASSIGNED", "AT-AGENCY", "RETURNED", "POSTPONED", "BOTH"), result.stream()
                .map(item -> item.packageData().trackingCode()).collect(Collectors.toSet()));
        assertEquals(2, result.stream().filter(item -> driver.getId().equals(item.packageData().driverId())).count());
        assertEquals(4, result.stream().filter(item -> item.packageData().returnedToDepotAt() != null).count());
        assertTrue(result.stream().filter(item -> driver.getId().equals(item.packageData().driverId()))
                .allMatch(item -> day.equals(item.packageData().assignedAt().toLocalDate())));
    }

    @Test
    void returnsTheDriverWorkspaceInBoundedPages() {
        UserEntity driver = driver("Livreur pagination");
        PackageEntity first = parcel("PAGE-1", driver, LocalDateTime.now(), PackageStatus.ASSIGNED);
        PackageEntity second = parcel("PAGE-2", driver, LocalDateTime.now(), PackageStatus.ASSIGNED);
        PackageEntity third = parcel("PAGE-3", driver, LocalDateTime.now(), PackageStatus.ASSIGNED);
        first.setCreatedAt(LocalDate.of(2026, 9, 1).atStartOfDay());
        second.setCreatedAt(LocalDate.of(2026, 9, 2).atStartOfDay());
        third.setCreatedAt(LocalDate.of(2026, 9, 3).atStartOfDay());
        packages.flush();

        var firstPage = packageService.findDriverWorkspacePage(driver.getId(), 0, 2);
        var secondPage = packageService.findDriverWorkspacePage(driver.getId(), 1, 2);

        assertEquals(3, firstPage.totalItems());
        assertEquals(2, firstPage.totalPages());
        assertEquals(2, firstPage.items().size());
        assertEquals(1, secondPage.items().size());
        assertEquals("PAGE-3", firstPage.items().getFirst().trackingCode());
        assertEquals("PAGE-1", secondPage.items().getFirst().trackingCode());

        var summary = packageService.findDriverWorkspaceSummary(driver.getId());
        assertEquals(3, summary.all());
        assertEquals(3, summary.toDeliver());
        assertEquals(0, summary.distribution());
    }

    @Test
    void filtersDriverWorkspaceBeforeApplyingThePageLimit() {
        UserEntity driver = driver("Livreur filtres");
        PackageEntity oldestMatch = parcel("MATCH-OLDER", driver, LocalDateTime.now(), PackageStatus.ASSIGNED);
        PackageEntity newestMatch = parcel("MATCH-NEWER", driver, LocalDateTime.now(), PackageStatus.IN_DELIVERY);
        PackageEntity nonMatch = parcel("OTHER", driver, LocalDateTime.now(), PackageStatus.ASSIGNED);
        oldestMatch.setCreatedAt(LocalDate.of(2026, 9, 1).atStartOfDay());
        newestMatch.setCreatedAt(LocalDate.of(2026, 9, 3).atStartOfDay());
        nonMatch.setCreatedAt(LocalDate.of(2026, 9, 4).atStartOfDay());
        packages.flush();

        var page = packageService.findDriverWorkspacePage(
                driver.getId(), 0, 1, DriverWorkspaceFilter.TO_DELIVER, "match",
                Set.of(PackageStatus.IN_DELIVERY).stream().toList(), DriverWorkspaceDateFilter.ALL);

        assertEquals(1, page.totalItems());
        assertEquals(1, page.items().size());
        assertEquals("MATCH-NEWER", page.items().getFirst().trackingCode());
    }

    @Test
    void filtersTheAdminTableByDayBeforeApplyingPagination() {
        LocalDate day = LocalDate.of(2026, 9, 5);
        PackageEntity matching = parcel("ADMIN-DAY", null, null, PackageStatus.TO_CONFIRM);
        matching.setCreatedAt(day.atTime(10, 0));
        matching.setUpdatedAt(day.atTime(10, 0));
        PackageEntity outsideDay = parcel("ADMIN-OLD", null, null, PackageStatus.TO_CONFIRM);
        outsideDay.setCreatedAt(day.minusDays(1).atTime(10, 0));
        outsideDay.setUpdatedAt(day.minusDays(1).atTime(10, 0));
        packages.flush();

        var result = packageService.findAdminDayPage(day, 0, 1, "admin", null);

        assertEquals(1, result.totalItems());
        assertEquals("ADMIN-DAY", result.items().getFirst().trackingCode());
    }

    @Test
    void departureScannerCountsAllAssignmentsAndSearchesOutsideTheDashboardPreview() {
        UserEntity driver = driver("Livreur scanner");
        LocalDateTime assignedAt = LocalDate.of(2026, 9, 17).atTime(8, 0);
        for (int index = 0; index < 40; index++) {
            PackageEntity assigned = parcel("SCANNER-" + index, driver, assignedAt.plusMinutes(index), PackageStatus.ASSIGNED);
            assigned.setCreatedAt(assignedAt.minusDays(index + 1L));
        }
        PackageEntity available = parcel("AGENCY-OLD-CODE", null, null, PackageStatus.AT_AGENCY);
        available.setRecipient("Client hors aperçu");
        available.setCreatedAt(assignedAt.minusYears(1));
        packages.flush();

        var summary = packageService.findDepartureScanner(driver.getId(), null);
        var assignedMatch = packageService.findDepartureScanner(driver.getId(), "SCANNER-39");
        var availableMatch = packageService.findDepartureScanner(driver.getId(), "AGENCY-OLD-CODE");

        assertEquals(40, summary.preparedCount());
        assertTrue(summary.matches().isEmpty());
        assertEquals("SCANNER-39", assignedMatch.matches().getFirst().trackingCode());
        assertEquals("AGENCY-OLD-CODE", availableMatch.matches().getFirst().trackingCode());
        assertEquals(40, packageService.confirmDriverDeparture(driver.getId()));
        assertEquals(40, packages.findByDriverIdAndStatus(driver.getId(), PackageStatus.IN_DELIVERY).size());
    }

    @Test
    void returnScannerFindsAnInDeliveryPackageOutsideTheDashboardPreview() {
        UserEntity driver = driver("Livreur retour scanner");
        LocalDateTime startedAt = LocalDate.of(2026, 9, 17).atTime(8, 0);
        for (int index = 0; index < 40; index++) {
            PackageEntity preview = parcel("PREVIEW-" + index, null, null, PackageStatus.TO_CONFIRM);
            preview.setCreatedAt(startedAt.plusMinutes(index));
        }
        PackageEntity returned = parcel("RETURN-SCANNED", driver, startedAt, PackageStatus.IN_DELIVERY);
        returned.setDeliveryStartedAt(startedAt);
        returned.setCreatedAt(startedAt.minusYears(1));
        packages.flush();

        var result = packageService.findReturnScanner("RETURN-SCANNED");

        assertEquals(1, result.inDeliveryCount());
        assertEquals("RETURN-SCANNED", result.matches().getFirst().trackingCode());
    }

    private PackageEntity depotReturn(String code, UserEntity driver, LocalDateTime returnedAt, PackageStatus status) {
        PackageEntity parcel = parcel(code, null, returnedAt.minusDays(1), status);
        parcel.setLastDriver(driver);
        parcel.setReturnedToDepotAt(returnedAt);
        return parcel;
    }

    private UserEntity driver(String name) {
        UserEntity user = new UserEntity();
        user.setName(name);
        user.setRole(Role.DRIVER);
        return users.save(user);
    }

    private PackageEntity parcel(String code, UserEntity driver, LocalDateTime assignedAt, PackageStatus status) {
        PackageEntity parcel = new PackageEntity();
        parcel.setTrackingCode(code);
        parcel.setDriver(driver);
        parcel.setAssignedAt(assignedAt);
        parcel.setStatus(status);
        parcel.setCreatedAt(LocalDate.of(2026, 9, 1).atStartOfDay());
        parcel.setUpdatedAt(assignedAt);
        return packages.save(parcel);
    }
}
