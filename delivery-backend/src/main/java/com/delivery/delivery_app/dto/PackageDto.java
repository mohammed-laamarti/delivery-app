package com.delivery.delivery_app.dto;

import com.delivery.delivery_app.enums.PackageStatus;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalDate;

public record PackageDto(
        Long id,
        String trackingCode,
        String recipient,
        String phone,
        String city,
        String address,
        BigDecimal price,
        String importComment,
        String confirmationComment,
        String confirmationChannel,
        LocalDateTime confirmedAt,
        LocalDateTime confirmationClaimedAt,
        LocalDateTime nextConfirmationAt,
        PackageStatus status,
        Long driverId,
        Long lastDriverId,
        Long confirmationDriverId,
        boolean agencyReceived,
        Long agencyReceiverDriverId,
        LocalDate nextDeliveryDate,
        LocalDate reportScheduledFor,
        LocalDateTime reportedAt,
        LocalDateTime returnedToDepotAt,
        String returnShipmentReference,
        LocalDateTime returnedToCompanyAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {
}
