package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.enums.Role;
import com.delivery.delivery_app.repository.DeliveryAttemptRepository;
import com.delivery.delivery_app.repository.PackageRepository;
import com.delivery.delivery_app.repository.UserRepository;
import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class DashboardOverviewServiceTest {
    @Autowired private DashboardOverviewService service;
    @Autowired private PackageRepository packages;
    @Autowired private DeliveryAttemptRepository attempts;
    @Autowired private UserRepository users;

    @Test
    void countsEveryDayPackageEvenWhenThePreviewWouldStopAtTwentyFive() {
        LocalDate day = LocalDate.of(2026, 9, 17);
        LocalDateTime start = day.atStartOfDay();
        UserEntity driver = driver();

        for (int index = 0; index < 100; index++) {
            packages.save(parcel("CONF-" + index, PackageStatus.TO_RECEIVE, start.plusMinutes(index)));
        }
        for (int index = 0; index < 3; index++) {
            PackageEntity inDelivery = parcel("TOUR-" + index, PackageStatus.IN_DELIVERY, start.plusHours(2));
            inDelivery.setDriver(driver);
            inDelivery.setDeliveryStartedAt(start.plusHours(8));
            packages.save(inDelivery);
        }
        PackageEntity returned = parcel("RETURN", PackageStatus.RETURNED, start.plusHours(3));
        returned.setDriver(driver);
        returned.setReturnedToDepotAt(start.plusHours(14));
        packages.save(returned);

        PackageEntity postponed = parcel("POSTPONED", PackageStatus.POSTPONED, start.minusDays(1));
        postponed.setNextDeliveryDate(day);
        packages.save(postponed);

        PackageEntity delivered = parcel("DELIVERED", PackageStatus.DELIVERED, start.minusDays(1));
        delivered.setUpdatedAt(start.plusHours(16));
        packages.save(delivered);
        DeliveryAttemptEntity attempt = new DeliveryAttemptEntity();
        attempt.setPackageEntity(delivered);
        attempt.setDriver(driver);
        attempt.setResult(DeliveryResult.DELIVERED);
        attempt.setCreatedAt(start.plusHours(16));
        attempts.save(attempt);
        packages.flush();

        var overview = service.overview(day);

        assertEquals(106, overview.totalPackages());
        assertEquals(105, overview.confirmedPackages());
        assertEquals(1, overview.deliveredPackages());
        assertEquals(1, overview.postponedPackages());
        assertEquals(3, overview.inProgressPackages());
        assertEquals(1, overview.returnedPackages());
        var driverStats = overview.drivers().stream().filter(stat -> stat.driverId().equals(driver.getId())).findFirst().orElseThrow();
        assertEquals(1, driverStats.processed());
        assertEquals(3, driverStats.inProgress());
        assertEquals(1, driverStats.delivered());
    }

    private UserEntity driver() {
        UserEntity driver = new UserEntity();
        driver.setName("Livreur dashboard");
        driver.setPhone("0600000100");
        driver.setPassword("secret");
        driver.setRole(Role.DRIVER);
        driver.setActive(true);
        return users.save(driver);
    }

    private PackageEntity parcel(String code, PackageStatus status, LocalDateTime createdAt) {
        PackageEntity parcel = new PackageEntity();
        parcel.setTrackingCode(code);
        parcel.setRecipient("Client " + code);
        parcel.setCity("Casablanca");
        parcel.setAddress("Adresse");
        parcel.setStatus(status);
        parcel.setCreatedAt(createdAt);
        parcel.setUpdatedAt(createdAt);
        return parcel;
    }
}
