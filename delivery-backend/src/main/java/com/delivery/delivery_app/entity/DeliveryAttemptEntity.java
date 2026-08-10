package com.delivery.delivery_app.entity;

import com.delivery.delivery_app.enums.DeliveryResult;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "delivery_attempts")
public class DeliveryAttemptEntity {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "package_id", nullable = false)
    private PackageEntity packageEntity;

    @ManyToOne
    @JoinColumn(name = "driver_id", nullable = false)
    private UserEntity driver;

    @Enumerated(EnumType.STRING)
    private DeliveryResult result;

    private String comment;
    private LocalDate nextDate;
    private LocalDateTime createdAt;
}
