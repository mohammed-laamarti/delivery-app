package com.delivery.delivery_app.repository;

import com.delivery.delivery_app.entity.PackageEntity;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.enums.DeliveryResult;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface PackageRepository extends JpaRepository<PackageEntity, Long> {
    Optional<PackageEntity> findByTrackingCode(String trackingCode);
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findAllByOrderByCreatedAtDesc();
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    Page<PackageEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** Bounded admin list for parcels created or reported on the selected day. */
    @Query(value = """
            select p from PackageEntity p
            where (
                    (p.createdAt >= :start and p.createdAt < :end)
                 or (p.status in :reportStatuses and (
                        p.nextDeliveryDate = :date
                     or (p.nextConfirmationAt >= :start and p.nextConfirmationAt < :end)
                 ))
            )
            and (
                    :query = ''
                 or lower(coalesce(p.trackingCode, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.recipient, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.city, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.phone, '')) like concat('%', :query, '%')
                 or (:digits <> '' and replace(replace(replace(p.phone, ' ', ''), '-', ''), '.', '') like concat('%', :digits, '%'))
            )
            and (:statusEmpty = true or p.status = :status)
            order by p.updatedAt desc, p.id desc
            """,
            countQuery = """
            select count(p) from PackageEntity p
            where (
                    (p.createdAt >= :start and p.createdAt < :end)
                 or (p.status in :reportStatuses and (
                        p.nextDeliveryDate = :date
                     or (p.nextConfirmationAt >= :start and p.nextConfirmationAt < :end)
                 ))
            )
            and (
                    :query = ''
                 or lower(coalesce(p.trackingCode, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.recipient, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.city, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.phone, '')) like concat('%', :query, '%')
                 or (:digits <> '' and replace(replace(replace(p.phone, ' ', ''), '-', ''), '.', '') like concat('%', :digits, '%'))
            )
            and (:statusEmpty = true or p.status = :status)
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    Page<PackageEntity> findAdminDayPage(
            @Param("date") java.time.LocalDate date,
            @Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end,
            @Param("reportStatuses") List<PackageStatus> reportStatuses,
            @Param("query") String query,
            @Param("digits") String digits,
            @Param("status") PackageStatus status,
            @Param("statusEmpty") boolean statusEmpty,
            Pageable pageable);

    /** Searches the complete parcel database for the admin table and camera scanner. */
    @Query(value = """
            select p from PackageEntity p
            where (
                    lower(coalesce(p.trackingCode, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.recipient, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.city, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.phone, '')) like concat('%', :query, '%')
                 or (:digits <> '' and replace(replace(replace(p.phone, ' ', ''), '-', ''), '.', '') like concat('%', :digits, '%'))
            )
            and (:statusEmpty = true or p.status = :status)
            order by p.updatedAt desc, p.id desc
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    Page<PackageEntity> findAdminSearchPage(
            @Param("query") String query,
            @Param("digits") String digits,
            @Param("status") PackageStatus status,
            @Param("statusEmpty") boolean statusEmpty,
            Pageable pageable);
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findByCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
            LocalDateTime from, LocalDateTime to);
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findByIdInOrderByCreatedAtDesc(List<Long> ids);
    long countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);

    /** Dashboard activity counts. Confirmations are counted from their own audit events. */
    @Query("""
            select count(p),
                   coalesce(sum(case when p.status = :postponedStatus then 1 else 0 end), 0),
                   coalesce(sum(case when p.status = :inDeliveryStatus
                                      and p.deliveryStartedAt >= :start and p.deliveryStartedAt < :end
                                     then 1 else 0 end), 0),
                   coalesce(sum(case when p.returnedToDepotAt >= :start and p.returnedToDepotAt < :end
                                      and p.status <> :deliveredStatus then 1 else 0 end), 0)
            from PackageEntity p
            where (p.createdAt >= :start and p.createdAt < :end)
               or (p.status in :reportStatuses and p.nextDeliveryDate = :date)
               or (p.nextConfirmationAt >= :start and p.nextConfirmationAt < :end)
               or (p.deliveryStartedAt >= :start and p.deliveryStartedAt < :end)
               or (p.updatedAt >= :start and p.updatedAt < :end)
               or exists (select h.id from PackageHistoryEntity h
                          where h.packageEntity = p and h.newStatus = :postponedStatus
                            and h.createdAt >= :start and h.createdAt < :end)
               or exists (select a.id from DeliveryAttemptEntity a
                          where a.packageEntity = p and a.result = :postponementResult
                            and a.createdAt >= :start and a.createdAt < :end)
            """)
    List<Object[]> findDashboardCounts(@Param("date") java.time.LocalDate date,
            @Param("start") LocalDateTime start, @Param("end") LocalDateTime end,
            @Param("reportStatuses") List<PackageStatus> reportStatuses,
            @Param("postponedStatus") PackageStatus postponedStatus,
            @Param("inDeliveryStatus") PackageStatus inDeliveryStatus,
            @Param("deliveredStatus") PackageStatus deliveredStatus,
            @Param("postponementResult") DeliveryResult postponementResult);

    @Query("""
            select p.driver.id, count(p) from PackageEntity p
            where p.driver is not null and p.status = :inDeliveryStatus
              and p.deliveryStartedAt >= :start and p.deliveryStartedAt < :end
            group by p.driver.id
            """)
    List<Object[]> findDashboardInProgressByDriver(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end, @Param("inDeliveryStatus") PackageStatus inDeliveryStatus);

    @Query("""
            select coalesce(p.driver.id, p.lastDriver.id), count(p) from PackageEntity p
            where (p.driver is not null or p.lastDriver is not null)
              and coalesce(p.assignedAt, p.deliveryStartedAt) >= :start
              and coalesce(p.assignedAt, p.deliveryStartedAt) < :end
            group by coalesce(p.driver.id, p.lastDriver.id)
            """)
    List<Object[]> findDashboardAssignmentsByDriver(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end);

    @Query("""
            select p.lastDriver.id, count(p) from PackageEntity p
            where p.lastDriver is not null and p.returnedToDepotAt >= :start and p.returnedToDepotAt < :end
              and p.status <> :deliveredStatus
            group by p.lastDriver.id
            """)
    List<Object[]> findDashboardReturnsByDriver(@Param("start") LocalDateTime start,
            @Param("end") LocalDateTime end, @Param("deliveredStatus") PackageStatus deliveredStatus);

    boolean existsByTrackingCode(String trackingCode);

    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findByDriverId(Long driverId);
    /** Assignments and physical depot returns for the day, including detached parcels. */
    @Query("""
            select p from PackageEntity p
            left join p.driver driver
            left join p.lastDriver lastDriver
            where (driver.id = :driverId
              and coalesce(p.assignedAt, p.deliveryStartedAt, p.updatedAt) >= :from
              and coalesce(p.assignedAt, p.deliveryStartedAt, p.updatedAt) < :to)
               or (lastDriver.id = :driverId
              and p.returnedToDepotAt >= :from and p.returnedToDepotAt < :to)
            order by coalesce(p.assignedAt, p.deliveryStartedAt, p.updatedAt) desc, p.id desc
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findDailyAssignedOrReturnedPackages(@Param("driverId") Long driverId,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
    List<PackageEntity> findByStatusOrderByCreatedAtDesc(PackageStatus status);
    List<PackageEntity> findByDriverIdAndStatus(Long driverId, PackageStatus status);
    long countByDriverIdAndStatus(Long driverId, PackageStatus status);

    /**
     * Searches only parcels relevant to one departure scanner. The limit is
     * supplied by the caller, so the browser never needs the complete parcel list.
     */
    @Query("""
            select p from PackageEntity p
            where (p.status in :availableStatuses
                   or (p.status = :assignedStatus and p.driver.id = :driverId))
              and (
                    lower(coalesce(p.trackingCode, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.recipient, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.city, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.phone, '')) like concat('%', :query, '%')
                 or (:digits <> '' and replace(replace(replace(p.phone, ' ', ''), '-', ''), '.', '') like concat('%', :digits, '%'))
              )
            order by case when lower(coalesce(p.trackingCode, '')) = :query then 0 else 1 end,
                     p.createdAt desc, p.id desc
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findDepartureScannerMatches(
            @Param("driverId") Long driverId,
            @Param("availableStatuses") List<PackageStatus> availableStatuses,
            @Param("assignedStatus") PackageStatus assignedStatus,
            @Param("query") String query,
            @Param("digits") String digits,
            Pageable pageable);

    @Query("""
            select count(p) from PackageEntity p
            where p.status = :inDeliveryStatus and p.driver is not null
            """)
    long countReturnScannerInDelivery(@Param("inDeliveryStatus") PackageStatus inDeliveryStatus);

    @Query("""
            select count(p) from PackageEntity p
            where p.status = :atAgencyStatus and p.returnedToDepotAt is not null and p.depotDecisionAt is null
            """)
    long countReturnScannerPendingDecisions(@Param("atAgencyStatus") PackageStatus atAgencyStatus);

    @Query("""
            select count(p) from PackageEntity p
            where p.agencyReceived = true and p.driver is null and p.returnedToDepotAt is null
              and p.depotDecisionAt is null and p.returnedToCompanyAt is null
              and p.status not in :excludedStatuses
            """)
    long countReturnScannerAgencyReceived(@Param("excludedStatuses") List<PackageStatus> excludedStatuses);

    /** Searches the complete return queue, independently from the dashboard preview. */
    @Query("""
            select p from PackageEntity p
            where (
                    (p.status = :inDeliveryStatus and p.driver is not null)
                 or (p.status = :atAgencyStatus and p.returnedToDepotAt is not null and p.depotDecisionAt is null)
                 or (p.agencyReceived = true and p.driver is null and p.returnedToDepotAt is null
                     and p.depotDecisionAt is null and p.returnedToCompanyAt is null
                     and p.status not in :excludedStatuses)
            )
              and (
                    lower(coalesce(p.trackingCode, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.recipient, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.city, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.phone, '')) like concat('%', :query, '%')
                 or (:digits <> '' and replace(replace(replace(p.phone, ' ', ''), '-', ''), '.', '') like concat('%', :digits, '%'))
              )
            order by case when lower(coalesce(p.trackingCode, '')) = :query then 0 else 1 end,
                     p.createdAt desc, p.id desc
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findReturnScannerMatches(
            @Param("inDeliveryStatus") PackageStatus inDeliveryStatus,
            @Param("atAgencyStatus") PackageStatus atAgencyStatus,
            @Param("excludedStatuses") List<PackageStatus> excludedStatuses,
            @Param("query") String query,
            @Param("digits") String digits,
            Pageable pageable);

    /** Searches every parcel that can still be physically received at the agency. */
    @Query("""
            select p from PackageEntity p
            where p.agencyReceived = false
              and (
                    p.status in :receivableStatuses
                 or (p.status = :postponedStatus and p.driver is null and p.nextConfirmationAt is not null)
              )
              and (
                    lower(coalesce(p.trackingCode, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.recipient, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.city, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.phone, '')) like concat('%', :query, '%')
                 or (:digits <> '' and replace(replace(replace(p.phone, ' ', ''), '-', ''), '.', '') like concat('%', :digits, '%'))
              )
            order by case when lower(coalesce(p.trackingCode, '')) = :query then 0 else 1 end,
                     p.createdAt desc, p.id desc
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findReceptionMatches(
            @Param("receivableStatuses") List<PackageStatus> receivableStatuses,
            @Param("postponedStatus") PackageStatus postponedStatus,
            @Param("query") String query,
            @Param("digits") String digits,
            Pageable pageable);
    List<PackageEntity> findByDriverIdAndStatusAndDeliveryStartedAtGreaterThanEqualAndDeliveryStartedAtLessThan(
            Long driverId, PackageStatus status, LocalDateTime from, LocalDateTime to);

    /**
     * The driver workspace combines the shared agency queue with the connected
     * driver's active tour. Membership does not depend on package creation date;
     * the display order does, so recording an action never moves a parcel.
     */
    @Query("""
            select p from PackageEntity p
            where (p.driver.id = :driverId and p.status in :activeDriverStatuses)
               or (p.driver.id = :driverId and p.status = :deliveredStatus
                   and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
               or p.status in :sharedAgencyStatuses
               or p.status = :atAgencyStatus
               or (p.status = :postponedStatus and p.driver is null)
               or p.status = :cancelledStatus
            order by p.createdAt desc, p.id desc
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    List<PackageEntity> findDriverWorkspace(
            @Param("driverId") Long driverId,
            @Param("activeDriverStatuses") List<PackageStatus> activeDriverStatuses,
            @Param("sharedAgencyStatuses") List<PackageStatus> sharedAgencyStatuses,
            @Param("atAgencyStatus") PackageStatus atAgencyStatus,
            @Param("postponedStatus") PackageStatus postponedStatus,
            @Param("cancelledStatus") PackageStatus cancelledStatus,
            @Param("deliveredStatus") PackageStatus deliveredStatus,
            @Param("todayStart") LocalDateTime todayStart,
            @Param("tomorrowStart") LocalDateTime tomorrowStart);

    /**
     * The paged counterpart of {@link #findDriverWorkspace(Long, List, List,
     * PackageStatus, PackageStatus, PackageStatus)}. Keeping the membership
     * predicate in the database prevents a driver's workspace from growing
     * into one unbounded HTTP response.
     */
    @Query("""
            select p from PackageEntity p
            where (p.driver.id = :driverId and p.status in :activeDriverStatuses)
               or p.status in :sharedAgencyStatuses
               or p.status = :atAgencyStatus
               or (p.status = :postponedStatus and p.driver is null)
               or p.status = :cancelledStatus
            order by p.createdAt desc, p.id desc
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    Page<PackageEntity> findDriverWorkspace(
            @Param("driverId") Long driverId,
            @Param("activeDriverStatuses") List<PackageStatus> activeDriverStatuses,
            @Param("sharedAgencyStatuses") List<PackageStatus> sharedAgencyStatuses,
            @Param("atAgencyStatus") PackageStatus atAgencyStatus,
            @Param("postponedStatus") PackageStatus postponedStatus,
            @Param("cancelledStatus") PackageStatus cancelledStatus,
            Pageable pageable);

    /**
     * Applies the driver's visible-list filters before pagination. In particular,
     * this must not be replaced with filtering a complete workspace in Java: that
     * makes a 25-item page load every parcel and every timeline entry.
     */
    @Query(value = """
            select p from PackageEntity p
            where (
                    (p.driver.id = :driverId and p.status in :activeDriverStatuses)
                 or (p.driver.id = :driverId and p.status = :deliveredStatus
                     and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
                 or p.status in :sharedAgencyStatuses
                 or p.status = :atAgencyStatus
                 or (p.status = :postponedStatus and p.driver is null)
                 or p.status = :cancelledStatus
            )
            and (
                    :filter = 'ALL'
                 or (:filter = 'DISTRIBUTION'
                     and (
                            p.status = :toConfirmStatus
                         or (p.status = :atAgencyStatus and (p.confirmationComment is null or p.confirmationComment = ''))
                         or (p.status = :postponedStatus and p.nextDeliveryDate is not null and p.nextDeliveryDate <= :today)
                     )
                     and (p.nextConfirmationAt is null or p.nextConfirmationAt < :tomorrowStart)
                     and (
                            (p.status = :toConfirmStatus and p.nextDeliveryDate is not null
                                and p.confirmationFollowUpDriver.id is not null
                                and p.confirmationFollowUpDriver.id = :driverId)
                         or (
                                not (p.status = :toConfirmStatus and p.nextDeliveryDate is not null
                                    and p.confirmationFollowUpDriver.id is not null)
                                and (p.confirmationDriver.id is null
                                    or p.confirmationDriver.id = :driverId
                                    or p.confirmationClaimedAt is null
                                    or p.confirmationClaimedAt <= :claimExpiredAt)
                         )
                     )
                 )
                 or (:filter = 'CONFIRMED' and p.status in :confirmedStatuses)
                 or (:filter = 'TO_DELIVER' and p.status in :toDeliverStatuses)
                 or (:filter = 'DELIVERED' and p.status = :deliveredStatus
                     and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
                 or (:filter in ('REPORTED_TODAY', 'REPORTED_TOMORROW')
                     and p.status in (:postponedStatus, :toConfirmStatus)
                     and (p.confirmationDriver.id is null or p.confirmationClaimedAt is null
                          or p.confirmationClaimedAt <= :claimExpiredAt)
                     and not exists (
                            select latestAttempt from DeliveryAttemptEntity latestAttempt
                            where latestAttempt.packageEntity = p
                              and latestAttempt.createdAt = (
                                    select max(attempt.createdAt) from DeliveryAttemptEntity attempt
                                    where attempt.packageEntity = p
                              )
                              and latestAttempt.result = :confirmationInDistributionResult
                     )
                     and (
                            p.nextDeliveryDate = :reportDate
                         or (p.nextDeliveryDate is null and p.nextConfirmationAt >= :reportStart
                             and p.nextConfirmationAt < :reportEnd)
                     )
                 )
            )
            and (
                    :query = ''
                 or lower(coalesce(p.trackingCode, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.recipient, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.city, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.phone, '')) like concat('%', :query, '%')
                 or (:digits <> '' and replace(replace(replace(p.phone, ' ', ''), '-', ''), '.', '') like concat('%', :digits, '%'))
            )
            and (
                    :statusesEmpty = true
                 or p.status in :statuses
                 or (:atAgencyStatus in :statuses and p.agencyReceived = true)
            )
            and (
                    :dateFilter = 'ALL'
                 or (:dateFilter = 'TODAY' and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
                 or (:dateFilter = 'YESTERDAY' and p.updatedAt >= :yesterdayStart and p.updatedAt < :todayStart)
                 or (:dateFilter = 'OLDER' and p.updatedAt < :yesterdayStart)
            )
            order by p.createdAt desc, p.id desc
            """,
            countQuery = """
            select count(p) from PackageEntity p
            where (
                    (p.driver.id = :driverId and p.status in :activeDriverStatuses)
                 or (p.driver.id = :driverId and p.status = :deliveredStatus
                     and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
                 or p.status in :sharedAgencyStatuses
                 or p.status = :atAgencyStatus
                 or (p.status = :postponedStatus and p.driver is null)
                 or p.status = :cancelledStatus
            )
            and (
                    :filter = 'ALL'
                 or (:filter = 'DISTRIBUTION'
                     and (
                            p.status = :toConfirmStatus
                         or (p.status = :atAgencyStatus and (p.confirmationComment is null or p.confirmationComment = ''))
                         or (p.status = :postponedStatus and p.nextDeliveryDate is not null and p.nextDeliveryDate <= :today)
                     )
                     and (p.nextConfirmationAt is null or p.nextConfirmationAt < :tomorrowStart)
                     and (
                            (p.status = :toConfirmStatus and p.nextDeliveryDate is not null
                                and p.confirmationFollowUpDriver.id is not null
                                and p.confirmationFollowUpDriver.id = :driverId)
                         or (
                                not (p.status = :toConfirmStatus and p.nextDeliveryDate is not null
                                    and p.confirmationFollowUpDriver.id is not null)
                                and (p.confirmationDriver.id is null
                                    or p.confirmationDriver.id = :driverId
                                    or p.confirmationClaimedAt is null
                                    or p.confirmationClaimedAt <= :claimExpiredAt)
                         )
                     )
                 )
                 or (:filter = 'CONFIRMED' and p.status in :confirmedStatuses)
                 or (:filter = 'TO_DELIVER' and p.status in :toDeliverStatuses)
                 or (:filter = 'DELIVERED' and p.status = :deliveredStatus
                     and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
                 or (:filter in ('REPORTED_TODAY', 'REPORTED_TOMORROW')
                     and p.status in (:postponedStatus, :toConfirmStatus)
                     and (p.confirmationDriver.id is null or p.confirmationClaimedAt is null
                          or p.confirmationClaimedAt <= :claimExpiredAt)
                     and not exists (
                            select latestAttempt from DeliveryAttemptEntity latestAttempt
                            where latestAttempt.packageEntity = p
                              and latestAttempt.createdAt = (
                                    select max(attempt.createdAt) from DeliveryAttemptEntity attempt
                                    where attempt.packageEntity = p
                              )
                              and latestAttempt.result = :confirmationInDistributionResult
                     )
                     and (
                            p.nextDeliveryDate = :reportDate
                         or (p.nextDeliveryDate is null and p.nextConfirmationAt >= :reportStart
                             and p.nextConfirmationAt < :reportEnd)
                     )
                 )
            )
            and (
                    :query = ''
                 or lower(coalesce(p.trackingCode, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.recipient, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.city, '')) like concat('%', :query, '%')
                 or lower(coalesce(p.phone, '')) like concat('%', :query, '%')
                 or (:digits <> '' and replace(replace(replace(p.phone, ' ', ''), '-', ''), '.', '') like concat('%', :digits, '%'))
            )
            and (
                    :statusesEmpty = true
                 or p.status in :statuses
                 or (:atAgencyStatus in :statuses and p.agencyReceived = true)
            )
            and (
                    :dateFilter = 'ALL'
                 or (:dateFilter = 'TODAY' and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
                 or (:dateFilter = 'YESTERDAY' and p.updatedAt >= :yesterdayStart and p.updatedAt < :todayStart)
                 or (:dateFilter = 'OLDER' and p.updatedAt < :yesterdayStart)
            )
            """)
    @EntityGraph(attributePaths = { "driver", "lastDriver", "confirmationDriver", "confirmationFollowUpDriver",
            "agencyReceiverDriver" })
    Page<PackageEntity> findDriverWorkspacePage(
            @Param("driverId") Long driverId,
            @Param("activeDriverStatuses") List<PackageStatus> activeDriverStatuses,
            @Param("sharedAgencyStatuses") List<PackageStatus> sharedAgencyStatuses,
            @Param("atAgencyStatus") PackageStatus atAgencyStatus,
            @Param("postponedStatus") PackageStatus postponedStatus,
            @Param("cancelledStatus") PackageStatus cancelledStatus,
            @Param("filter") String filter,
            @Param("toConfirmStatus") PackageStatus toConfirmStatus,
            @Param("confirmedStatuses") List<PackageStatus> confirmedStatuses,
            @Param("toDeliverStatuses") List<PackageStatus> toDeliverStatuses,
            @Param("deliveredStatus") PackageStatus deliveredStatus,
            @Param("confirmationInDistributionResult") DeliveryResult confirmationInDistributionResult,
            @Param("today") java.time.LocalDate today,
            @Param("todayStart") LocalDateTime todayStart,
            @Param("tomorrowStart") LocalDateTime tomorrowStart,
            @Param("yesterdayStart") LocalDateTime yesterdayStart,
            @Param("claimExpiredAt") LocalDateTime claimExpiredAt,
            @Param("reportDate") java.time.LocalDate reportDate,
            @Param("reportStart") LocalDateTime reportStart,
            @Param("reportEnd") LocalDateTime reportEnd,
            @Param("query") String query,
            @Param("digits") String digits,
            @Param("statuses") List<PackageStatus> statuses,
            @Param("statusesEmpty") boolean statusesEmpty,
            @Param("dateFilter") String dateFilter,
            Pageable pageable);

    /** Counts one filtered driver-workspace card without selecting a package row. */
    @Query("""
            select count(p) from PackageEntity p
            where (
                    (p.driver.id = :driverId and p.status in :activeDriverStatuses)
                 or (p.driver.id = :driverId and p.status = :deliveredStatus
                     and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
                 or p.status in :sharedAgencyStatuses
                 or p.status = :atAgencyStatus
                 or (p.status = :postponedStatus and p.driver is null)
                 or p.status = :cancelledStatus
            )
            and (
                    :filter = 'ALL'
                 or (:filter = 'DISTRIBUTION'
                     and (
                            p.status = :toConfirmStatus
                         or (p.status = :atAgencyStatus and (p.confirmationComment is null or p.confirmationComment = ''))
                         or (p.status = :postponedStatus and p.nextDeliveryDate is not null and p.nextDeliveryDate <= :today)
                     )
                     and (p.nextConfirmationAt is null or p.nextConfirmationAt < :tomorrowStart)
                     and (
                            (p.status = :toConfirmStatus and p.nextDeliveryDate is not null
                                and p.confirmationFollowUpDriver.id is not null
                                and p.confirmationFollowUpDriver.id = :driverId)
                         or (
                                not (p.status = :toConfirmStatus and p.nextDeliveryDate is not null
                                    and p.confirmationFollowUpDriver.id is not null)
                                and (p.confirmationDriver.id is null
                                    or p.confirmationDriver.id = :driverId
                                    or p.confirmationClaimedAt is null
                                    or p.confirmationClaimedAt <= :claimExpiredAt)
                         )
                     )
                 )
                 or (:filter = 'CONFIRMED' and p.status in :confirmedStatuses)
                 or (:filter = 'TO_DELIVER' and p.status in :toDeliverStatuses)
                 or (:filter = 'DELIVERED' and p.status = :deliveredStatus
                     and p.updatedAt >= :todayStart and p.updatedAt < :tomorrowStart)
                 or (:filter in ('REPORTED_TODAY', 'REPORTED_TOMORROW')
                     and p.status in (:postponedStatus, :toConfirmStatus)
                     and (p.confirmationDriver.id is null or p.confirmationClaimedAt is null
                          or p.confirmationClaimedAt <= :claimExpiredAt)
                     and not exists (
                            select latestAttempt from DeliveryAttemptEntity latestAttempt
                            where latestAttempt.packageEntity = p
                              and latestAttempt.createdAt = (
                                    select max(attempt.createdAt) from DeliveryAttemptEntity attempt
                                    where attempt.packageEntity = p
                              )
                              and latestAttempt.result = :confirmationInDistributionResult
                     )
                     and (
                            p.nextDeliveryDate = :reportDate
                         or (p.nextDeliveryDate is null and p.nextConfirmationAt >= :reportStart
                             and p.nextConfirmationAt < :reportEnd)
                     )
                 )
            )
            """)
    long countDriverWorkspace(
            @Param("driverId") Long driverId,
            @Param("activeDriverStatuses") List<PackageStatus> activeDriverStatuses,
            @Param("sharedAgencyStatuses") List<PackageStatus> sharedAgencyStatuses,
            @Param("atAgencyStatus") PackageStatus atAgencyStatus,
            @Param("postponedStatus") PackageStatus postponedStatus,
            @Param("cancelledStatus") PackageStatus cancelledStatus,
            @Param("filter") String filter,
            @Param("toConfirmStatus") PackageStatus toConfirmStatus,
            @Param("confirmedStatuses") List<PackageStatus> confirmedStatuses,
            @Param("toDeliverStatuses") List<PackageStatus> toDeliverStatuses,
            @Param("deliveredStatus") PackageStatus deliveredStatus,
            @Param("confirmationInDistributionResult") DeliveryResult confirmationInDistributionResult,
            @Param("today") java.time.LocalDate today,
            @Param("todayStart") LocalDateTime todayStart,
            @Param("tomorrowStart") LocalDateTime tomorrowStart,
            @Param("claimExpiredAt") LocalDateTime claimExpiredAt,
            @Param("reportDate") java.time.LocalDate reportDate,
            @Param("reportStart") LocalDateTime reportStart,
            @Param("reportEnd") LocalDateTime reportEnd);

    /**
     * Serializes confirmation claims for one package. A concurrent caller waits until
     * the first transaction commits, then reads the driver that claimed the package.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PackageEntity p where p.id = :id")
    Optional<PackageEntity> findByIdForConfirmationClaim(@Param("id") Long id);
}
