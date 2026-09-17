package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.DeliveryAttemptEntity;
import com.delivery.delivery_app.dto.DailyDriverStatsDto;
import com.delivery.delivery_app.enums.DeliveryResult;
import com.delivery.delivery_app.enums.PackageStatus;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DeliveryAttemptRepository extends JpaRepository<DeliveryAttemptEntity, Long> {
    List<DeliveryAttemptEntity> findByPackageEntityIdOrderByCreatedAtDesc(Long packageId);
    @EntityGraph(attributePaths = "driver")
    List<DeliveryAttemptEntity> findByPackageEntityIdInOrderByCreatedAtDesc(Collection<Long> packageIds);
    Optional<DeliveryAttemptEntity> findFirstByPackageEntityIdOrderByCreatedAtDesc(Long packageId);
    long deleteByPackageEntityId(Long packageId);
    List<DeliveryAttemptEntity> findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);
    List<DeliveryAttemptEntity> findByDriverIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
            Long driverId, LocalDateTime from, LocalDateTime to);

    @Query("""
            select new com.delivery.delivery_app.dto.DailyDriverStatsDto(
                d.driver.id, d.driver.name, count(d),
                coalesce(sum(case when d.result = :deliveredResult and d.packageEntity.status = :deliveredStatus then 1 else 0 end), 0),
                coalesce(sum(case when d.result = :deliveredResult and d.packageEntity.status = :deliveredStatus
                                  then d.packageEntity.price else 0 end), 0))
            from DeliveryAttemptEntity d
            where d.createdAt >= :start and d.createdAt < :end
              and d.createdAt = (select max(later.createdAt) from DeliveryAttemptEntity later
                                 where later.packageEntity = d.packageEntity
                                   and later.createdAt >= :start and later.createdAt < :end)
            group by d.driver.id, d.driver.name
            """)
    List<DailyDriverStatsDto> findDailyDriverStats(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end, @Param("deliveredResult") DeliveryResult deliveredResult,
            @Param("deliveredStatus") PackageStatus deliveredStatus);

    @Query("""
            select count(d.packageEntity.id) from DeliveryAttemptEntity d
            where d.result = :deliveredResult and d.packageEntity.status = :deliveredStatus
              and d.createdAt >= :start and d.createdAt < :end
              and d.createdAt = (select max(later.createdAt) from DeliveryAttemptEntity later
                                 where later.packageEntity = d.packageEntity
                                   and later.createdAt >= :start and later.createdAt < :end)
            """)
    long countDailyDeliveredPackages(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end, @Param("deliveredResult") DeliveryResult deliveredResult,
            @Param("deliveredStatus") PackageStatus deliveredStatus);
}
