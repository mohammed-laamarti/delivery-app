package com.delivery.delivery_app.controller;

import com.delivery.delivery_app.dto.DailyDeliveryStatsDto;
import com.delivery.delivery_app.dto.DailyDriverStatsDto;
import com.delivery.delivery_app.dto.DashboardOverviewDto;
import java.util.List;
import com.delivery.delivery_app.service.DeliveryAttemptService;
import com.delivery.delivery_app.service.DashboardOverviewService;
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
    private final DashboardOverviewService overviewService;

    public DashboardController(DeliveryAttemptService attemptService, DashboardOverviewService overviewService) {
        this.attemptService = attemptService;
        this.overviewService = overviewService;
    }

    @GetMapping("/stats")
    public DailyDeliveryStatsDto stats(@RequestParam LocalDate date) {
        return attemptService.dailyStats(date);
    }

    @GetMapping("/driver-stats")
    public List<DailyDriverStatsDto> driverStats(@RequestParam LocalDate date) {
        return attemptService.dailyDriverStats(date);
    }

    @GetMapping("/overview")
    public DashboardOverviewDto overview(@RequestParam LocalDate date) {
        return overviewService.overview(date);
    }
}
