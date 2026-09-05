package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.PackageHistoryEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
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

        assertEquals(Set.of("MIDNIGHT", "IN-PROGRESS", "DELIVERED"), result.stream()
                .map(item -> item.packageData().trackingCode()).collect(Collectors.toSet()));
        assertEquals(PackageStatus.DELIVERED, result.getFirst().activityStatus());
        assertEquals(1, service.findDriverDailyActivity(driver.getId(), day.plusDays(1)).size());
        assertTrue(service.findDriverDailyActivity(driver.getId(), day.plusDays(3)).isEmpty());
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
