package com.delivery.delivery_app.entity;

import com.delivery.delivery_app.enums.PackageStatus;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "packages")
public class PackageEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String trackingCode;
    private String recipient;
    private String phone;
    private String city;
    private String address;
    private BigDecimal price;
    private String importComment;
    private String confirmationComment;
    private String confirmationChannel;
    private boolean agencyReceived = false;

    @Enumerated(EnumType.STRING)
    private PackageStatus status = PackageStatus.TO_CONFIRM;

    @ManyToOne
    @JoinColumn(name = "driver_id")
    private UserEntity driver;

    @ManyToOne
    @JoinColumn(name = "last_driver_id")
    private UserEntity lastDriver;

    @ManyToOne
    @JoinColumn(name = "confirmation_driver_id")
    private UserEntity confirmationDriver;

    @ManyToOne
    @JoinColumn(name = "agency_receiver_driver_id")
    private UserEntity agencyReceiverDriver;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
