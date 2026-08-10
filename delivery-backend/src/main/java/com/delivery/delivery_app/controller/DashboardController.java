package com.delivery.delivery_app.controller;

import com.delivery.delivery_app.dto.DailyDeliveryStatsDto;
import com.delivery.delivery_app.service.DeliveryAttemptService;
import java.time.LocalDate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("hasRole('ADMIN')")
public class DashboardController {
    private final DeliveryAttemptService attemptService;

    public DashboardController(DeliveryAttemptService attemptService) {
        this.attemptService = attemptService;
    }

    @GetMapping("/stats")
    public DailyDeliveryStatsDto stats(@RequestParam LocalDate date) {
        return attemptService.dailyStats(date);
    }
}
