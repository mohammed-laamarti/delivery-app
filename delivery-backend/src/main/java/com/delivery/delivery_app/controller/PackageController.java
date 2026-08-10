package com.delivery.delivery_app.controller;

import com.delivery.delivery_app.dto.DeliveryAttemptDto;
import com.delivery.delivery_app.dto.DeliveryAttemptRequest;
import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.dto.PackageHistoryDto;
import com.delivery.delivery_app.dto.PackageHistoryRequest;
import com.delivery.delivery_app.dto.PackageRequest;
import com.delivery.delivery_app.dto.ImportResultDto;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.service.DeliveryAttemptService;
import com.delivery.delivery_app.service.PackageHistoryService;
import com.delivery.delivery_app.service.PackageService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import io.jsonwebtoken.Claims;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.MediaType;
import com.delivery.delivery_app.service.ExcelImportService;

@RestController
@RequestMapping("/api/packages")
public class PackageController {
    private final PackageService packageService;
    private final DeliveryAttemptService attemptService;
    private final PackageHistoryService historyService;
    private final ExcelImportService excelImportService;

    public PackageController(PackageService packageService, DeliveryAttemptService attemptService,
            PackageHistoryService historyService, ExcelImportService excelImportService) {
        this.packageService = packageService;
        this.attemptService = attemptService;
        this.historyService = historyService;
        this.excelImportService = excelImportService;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<PackageDto> findAll() { return packageService.findAll(); }

    @GetMapping("/my")
    @PreAuthorize("hasRole('DRIVER')")
    public List<PackageDto> findMyPackages(Authentication authentication) {
        Claims claims = (Claims) authentication.getDetails();
        return packageService.findByDriver(claims.get("userId", Long.class));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto findById(@PathVariable Long id) { return packageService.findById(id); }

    @GetMapping("/tracking/{trackingCode}")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto findByTrackingCode(@PathVariable String trackingCode) { return packageService.findByTrackingCode(trackingCode); }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public PackageDto create(@RequestBody PackageRequest request) { return packageService.create(request); }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public ImportResultDto importExcel(@RequestPart("file") MultipartFile file) {
        return excelImportService.importPackages(file);
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto update(@PathVariable Long id, @RequestBody PackageRequest request) { return packageService.update(id, request); }

    @PatchMapping("/{id}/assign/{driverId}")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto assignDriver(@PathVariable Long id, @PathVariable Long driverId) { return packageService.assignDriver(id, driverId); }

    @PatchMapping("/{id}/return")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto registerReturn(@PathVariable Long id) { return packageService.registerReturn(id); }

    @PatchMapping("/{id}/depot-arrival")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto registerDepotArrival(@PathVariable Long id) {
        return packageService.registerDepotArrival(id);
    }

    @PatchMapping("/{id}/depot-decision")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto decideDepotStatus(@PathVariable Long id, @RequestParam PackageStatus status) {
        return packageService.decideDepotStatus(id, status);
    }

    @PatchMapping("/{id}/status")
    public PackageDto updateStatus(@PathVariable Long id, @RequestParam PackageStatus status,
            Authentication authentication) {
        if (isAdmin(authentication)) {
            if (status == PackageStatus.IN_DELIVERY) return packageService.startDelivery(id);
            if (status == PackageStatus.DELIVERED) return packageService.completeDelivery(id);
            throw new IllegalArgumentException("Utilisez le workflow depot pour ce statut.");
        }
        if (status != PackageStatus.DELIVERED) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Le livreur ne peut pas decider ce statut.");
        }
        return packageService.completeDeliveryForDriver(id, currentUserId(authentication));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) { packageService.delete(id); }

    @GetMapping("/{id}/attempts")
    public List<DeliveryAttemptDto> attempts(@PathVariable Long id, Authentication authentication) {
        if (!isAdmin(authentication)) {
            packageService.verifyAssignedToDriver(id, currentUserId(authentication));
        }
        return attemptService.findByPackage(id);
    }

    @PostMapping("/{id}/attempts")
    @ResponseStatus(HttpStatus.CREATED)
    public DeliveryAttemptDto createAttempt(@PathVariable Long id, @RequestBody DeliveryAttemptRequest request,
            Authentication authentication) {
        Long driverId = isAdmin(authentication) ? request.driverId() : currentUserId(authentication);
        if (driverId == null) {
            throw new IllegalArgumentException("Le livreur est obligatoire.");
        }
        if (!isAdmin(authentication)) {
            packageService.verifyInDeliveryForDriver(id, driverId);
        }
        return attemptService.create(new DeliveryAttemptRequest(id, driverId, request.result(), request.comment(), request.nextDate()));
    }

    @GetMapping("/{id}/history")
    public List<PackageHistoryDto> history(@PathVariable Long id) { return historyService.findByPackage(id); }

    @PostMapping("/{id}/history")
    @ResponseStatus(HttpStatus.CREATED)
    public PackageHistoryDto createHistory(@PathVariable Long id, @RequestBody PackageHistoryRequest request,
            @RequestParam PackageStatus newStatus) {
        return historyService.create(new PackageHistoryRequest(id, request.userId(), request.comment()), newStatus);
    }

    private Long currentUserId(Authentication authentication) {
        Claims claims = (Claims) authentication.getDetails();
        return claims.get("userId", Long.class);
    }

    private boolean isAdmin(Authentication authentication) {
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch("ROLE_ADMIN"::equals);
    }
}
