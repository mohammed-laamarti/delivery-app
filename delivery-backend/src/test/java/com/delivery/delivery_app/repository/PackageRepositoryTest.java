package com.delivery.delivery_app.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.enums.Role;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@Transactional
class PackageRepositoryTest {
    @Autowired
    private PackageRepository packageRepository;

    @Autowired
    private UserRepository userRepository;

    @Test
    void driverAssignmentHistoryContainsCurrentAndReturnedParcelsForThatDriver() {
        UserEntity connectedDriver = userRepository.save(driver("Livreur connecté", "0600000001"));
        UserEntity anotherDriver = userRepository.save(driver("Autre livreur", "0600000002"));

        PackageEntity assigned = packageRepository.save(packageFor("ASSIGNED-1", connectedDriver, PackageStatus.ASSIGNED));
        PackageEntity inDelivery = packageRepository.save(packageFor("IN-DELIVERY-1", connectedDriver, PackageStatus.IN_DELIVERY));
        PackageEntity delivered = packageRepository.save(packageFor("DELIVERED-1", connectedDriver, PackageStatus.DELIVERED));
        PackageEntity returned = packageFor("RETURNED-1", null, PackageStatus.RETURNED);
        returned.setLastDriver(connectedDriver);
        returned = packageRepository.save(returned);
        packageRepository.save(packageFor("UNASSIGNED-CONFIRM", null, PackageStatus.TO_CONFIRM));
        packageRepository.save(packageFor("OTHER-DRIVER", anotherDriver, PackageStatus.ASSIGNED));

        List<Long> packageIds = packageRepository.findDriverAssignmentHistory(connectedDriver.getId())
                .stream().map(PackageEntity::getId).toList();

        assertEquals(List.of(returned.getId(), delivered.getId(), inDelivery.getId(), assigned.getId()), packageIds);
    }

    private UserEntity driver(String name, String phone) {
        UserEntity driver = new UserEntity();
        driver.setName(name);
        driver.setPhone(phone);
        driver.setPassword("secret");
        driver.setRole(Role.DRIVER);
        return driver;
    }

    private PackageEntity packageFor(String trackingCode, UserEntity driver, PackageStatus status) {
        PackageEntity packageEntity = new PackageEntity();
        packageEntity.setTrackingCode(trackingCode);
        packageEntity.setDriver(driver);
        packageEntity.setStatus(status);
        packageEntity.setCreatedAt(LocalDateTime.of(2026, 9, 4, 10, 0));
        return packageEntity;
    }
}
