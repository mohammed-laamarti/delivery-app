package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.PackageHistoryEntity;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PackageHistoryRepository extends JpaRepository<PackageHistoryEntity, Long> {
    List<PackageHistoryEntity> findByPackageEntityIdOrderByCreatedAtDesc(Long packageId);
    @EntityGraph(attributePaths = "user")
    List<PackageHistoryEntity> findByPackageEntityIdInOrderByCreatedAtDesc(Collection<Long> packageIds);
    List<PackageHistoryEntity> findByUserIdAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
            Long userId, LocalDateTime from, LocalDateTime to);
    long deleteByPackageEntityId(Long packageId);

    /** A confirmation is an explicit customer-contact event, never a future callback. */
    @Query("""
            select count(distinct h.packageEntity.id) from PackageHistoryEntity h
            where h.createdAt >= :start and h.createdAt < :end
              and h.comment like 'Confirmation client enregistrée%'
            """)
    long countDashboardConfirmedPackages(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);

    @Query("""
            select h.user.id, count(h) from PackageHistoryEntity h
            where h.createdAt >= :start and h.createdAt < :end
              and h.comment like 'Confirmation client enregistrée%'
            group by h.user.id
            """)
    List<Object[]> findDashboardConfirmationsByDriver(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);
}
