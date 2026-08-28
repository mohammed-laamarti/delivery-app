package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.PackageEntity;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import com.delivery.delivery_app.enums.PackageStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PackageRepository extends JpaRepository<PackageEntity, Long> {
    Optional<PackageEntity> findByTrackingCode(String trackingCode);
    List<PackageEntity> findAllByOrderByCreatedAtDesc();
    long countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);

    boolean existsByTrackingCode(String trackingCode);

    List<PackageEntity> findByDriverId(Long driverId);
    List<PackageEntity> findByStatusOrderByCreatedAtDesc(PackageStatus status);
    List<PackageEntity> findByDriverIdAndStatus(Long driverId, PackageStatus status);

    /**
     * The driver workspace combines the shared agency queue with the connected
     * driver's active tour. It deliberately does not depend on package creation date.
     */
    @Query("""
            select p from PackageEntity p
            where (p.driver.id = :driverId and p.status in :activeDriverStatuses)
               or p.status in :sharedAgencyStatuses
               or p.status = :atAgencyStatus
               or (p.status = :postponedStatus and p.driver is null)
               or p.status = :cancelledStatus
            order by p.updatedAt desc
            """)
    List<PackageEntity> findDriverWorkspace(
            @Param("driverId") Long driverId,
            @Param("activeDriverStatuses") List<PackageStatus> activeDriverStatuses,
            @Param("sharedAgencyStatuses") List<PackageStatus> sharedAgencyStatuses,
            @Param("atAgencyStatus") PackageStatus atAgencyStatus,
            @Param("postponedStatus") PackageStatus postponedStatus,
            @Param("cancelledStatus") PackageStatus cancelledStatus);

    /**
     * Serializes confirmation claims for one package. A concurrent caller waits until
     * the first transaction commits, then reads the driver that claimed the package.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PackageEntity p where p.id = :id")
    Optional<PackageEntity> findByIdForConfirmationClaim(@Param("id") Long id);
}
