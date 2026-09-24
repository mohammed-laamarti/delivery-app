package com.delivery.delivery_app.controller;

import com.delivery.delivery_app.dto.DeliveryAttemptDto;
import com.delivery.delivery_app.dto.DeliveryAttemptRequest;
import com.delivery.delivery_app.dto.DriverDailyActivityDto;
import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.dto.PackagePageDto;
import com.delivery.delivery_app.dto.DriverWorkspaceSummaryDto;
import com.delivery.delivery_app.dto.DepartureScannerDto;
import com.delivery.delivery_app.dto.DepartureResultDto;
import com.delivery.delivery_app.dto.ReturnScannerDto;
import com.delivery.delivery_app.dto.PackageHistoryDto;
import com.delivery.delivery_app.dto.PackageHistoryRequest;
import com.delivery.delivery_app.dto.PackageRequest;
import com.delivery.delivery_app.dto.ImportResultDto;
import com.delivery.delivery_app.dto.ConfirmationRequest;
import com.delivery.delivery_app.dto.ConfirmationCommentRequest;
import com.delivery.delivery_app.dto.ConfirmationOutcomeRequest;
import com.delivery.delivery_app.dto.ReturnShipmentRequest;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.enums.DriverWorkspaceDateFilter;
import com.delivery.delivery_app.enums.DriverWorkspaceFilter;
import com.delivery.delivery_app.service.DeliveryAttemptService;
import com.delivery.delivery_app.service.PackageHistoryService;
import com.delivery.delivery_app.service.PackageService;
import java.util.List;
import java.util.function.Supplier;
import java.time.LocalDate;
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
import com.delivery.delivery_app.service.PdfImportService;
import com.delivery.delivery_app.service.ExcelExportService;
import com.delivery.delivery_app.service.DriverManifestPdfService;
import com.delivery.delivery_app.service.RealtimeEventService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ContentDisposition;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/packages")
public class PackageController {
    private final PackageService packageService;
    private final DeliveryAttemptService attemptService;
    private final PackageHistoryService historyService;
    private final ExcelImportService excelImportService;
    private final PdfImportService pdfImportService;
    private final ExcelExportService excelExportService;
    private final DriverManifestPdfService driverManifestPdfService;
    private final RealtimeEventService realtimeEventService;

    public PackageController(PackageService packageService, DeliveryAttemptService attemptService,
            PackageHistoryService historyService, ExcelImportService excelImportService, PdfImportService pdfImportService,
            ExcelExportService excelExportService, DriverManifestPdfService driverManifestPdfService,
            RealtimeEventService realtimeEventService) {
        this.packageService = packageService;
        this.attemptService = attemptService;
        this.historyService = historyService;
        this.excelImportService = excelImportService;
        this.pdfImportService = pdfImportService;
        this.excelExportService = excelExportService;
        this.driverManifestPdfService = driverManifestPdfService;
        this.realtimeEventService = realtimeEventService;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public List<PackageDto> findAll() { return packageService.findAll(); }

    @GetMapping("/page")
    @PreAuthorize("hasRole('ADMIN')")
    public PackagePageDto findPage(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size,
            @RequestParam(required = false) LocalDate date,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) PackageStatus status) {
        if (date != null) return packageService.findAdminDayPage(date, page, size, query, status);
        if (query != null && !query.isBlank()) return packageService.findAdminSearchPage(page, size, query, status);
        return packageService.findPage(page, size);
    }

    @GetMapping("/returns")
    @PreAuthorize("hasRole('ADMIN')")
    public PackagePageDto findReturnsPage(@RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String query) {
        return packageService.findReturnsPage(page, size, query);
    }

    @GetMapping("/export")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<byte[]> exportExcel() {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("colis.xlsx").build().toString())
                .header(HttpHeaders.CONTENT_TYPE,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .body(excelExportService.exportPackages(LocalDate.now()));
    }

    @PostMapping("/export")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<byte[]> exportSelectedExcel(@RequestBody List<Long> packageIds) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("colis.xlsx").build().toString())
                .header(HttpHeaders.CONTENT_TYPE,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
                .body(excelExportService.exportPackagesByIds(packageIds));
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('DRIVER')")
    public List<PackageDto> findMyPackages(Authentication authentication) {
        Claims claims = (Claims) authentication.getDetails();
        return packageService.findByDriver(claims.get("userId", Long.class));
    }

    @GetMapping("/driver-view")
    @PreAuthorize("hasRole('DRIVER')")
    public List<PackageDto> findDriverWorkspace(Authentication authentication) {
        return packageService.findDriverWorkspace(currentUserId(authentication));
    }

    @GetMapping("/driver-view/page")
    @PreAuthorize("hasRole('DRIVER')")
    public PackagePageDto findDriverWorkspacePage(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(defaultValue = "ALL") DriverWorkspaceFilter filter,
            @RequestParam(required = false) String query,
            @RequestParam(required = false) List<PackageStatus> statuses,
            @RequestParam(defaultValue = "ALL") DriverWorkspaceDateFilter date,
            Authentication authentication) {
        return packageService.findDriverWorkspacePage(currentUserId(authentication), page, size, filter, query, statuses, date);
    }

    @GetMapping("/driver-view/summary")
    @PreAuthorize("hasRole('DRIVER')")
    public DriverWorkspaceSummaryDto findDriverWorkspaceSummary(Authentication authentication) {
        return packageService.findDriverWorkspaceSummary(currentUserId(authentication));
    }

    @GetMapping("/driver-view/reception-search")
    @PreAuthorize("hasRole('DRIVER')")
    public List<PackageDto> findReceptionMatches(@RequestParam String query) {
        return packageService.findReceptionMatches(query);
    }

    @GetMapping("/driver-view/{id}")
    @PreAuthorize("hasRole('DRIVER')")
    public PackageDto findDriverWorkspacePackage(@PathVariable Long id, Authentication authentication) {
        return packageService.findDriverWorkspace(currentUserId(authentication)).stream()
                .filter(item -> item.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new java.util.NoSuchElementException("Colis introuvable dans votre espace."));
    }

    @GetMapping("/drivers/{driverId}/activities")
    @PreAuthorize("hasRole('ADMIN')")
    public List<DriverDailyActivityDto> findDriverDailyActivity(@PathVariable Long driverId, @RequestParam LocalDate date) {
        return attemptService.findDriverDailyActivity(driverId, date);
    }

    @GetMapping("/drivers/{driverId}/departure-scanner")
    @PreAuthorize("hasRole('ADMIN')")
    public DepartureScannerDto findDepartureScanner(@PathVariable Long driverId,
            @RequestParam(required = false) String query) {
        return packageService.findDepartureScanner(driverId, query);
    }

    @GetMapping("/return-scanner")
    @PreAuthorize("hasRole('ADMIN')")
    public ReturnScannerDto findReturnScanner(@RequestParam(required = false) String query) {
        return packageService.findReturnScanner(query);
    }

    @GetMapping(value = "/drivers/{driverId}/manifest", produces = MediaType.APPLICATION_PDF_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<byte[]> downloadDriverManifest(@PathVariable Long driverId, @RequestParam LocalDate date) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename("bon-livreur-" + driverId + "-" + date + ".pdf")
                                .build().toString())
                .contentType(MediaType.APPLICATION_PDF)
                .body(driverManifestPdfService.generate(driverId, date));
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
    public PackageDto create(@RequestBody PackageRequest request) { return publish(packageService.create(request)); }

    @PatchMapping("/{id}/confirmation/claim")
    @PreAuthorize("hasRole('DRIVER')")
    public PackageDto claimConfirmation(@PathVariable Long id, Authentication authentication) {
        return publish(id, () -> packageService.claimConfirmation(id, currentUserId(authentication)));
    }

    @PatchMapping("/{id}/confirmation/release")
    @PreAuthorize("hasRole('DRIVER')")
    public PackageDto releaseConfirmationClaim(@PathVariable Long id, Authentication authentication) {
        return publish(id, () -> packageService.releaseConfirmationClaim(id, currentUserId(authentication)));
    }

    @PatchMapping("/{id}/confirmation")
    @PreAuthorize("hasRole('DRIVER')")
    public PackageDto confirmCustomer(@PathVariable Long id, @RequestBody ConfirmationRequest request,
            Authentication authentication) {
        return publish(id, () -> packageService.confirmCustomer(id, currentUserId(authentication), request.comment(), request.channel()));
    }

    @PatchMapping("/{id}/confirmation/comment")
    @PreAuthorize("hasRole('DRIVER')")
    public PackageDto updateConfirmationComment(@PathVariable Long id, @RequestBody ConfirmationCommentRequest request,
            Authentication authentication) {
        return publish(id, () -> packageService.updateConfirmationComment(id, currentUserId(authentication), request.comment()));
    }

    @PatchMapping("/{id}/confirmation/reopen")
    @PreAuthorize("hasRole('DRIVER')")
    public PackageDto reopenCancelledConfirmation(@PathVariable Long id, Authentication authentication) {
        return publish(id, () -> packageService.reopenCancelledConfirmation(id, currentUserId(authentication)));
    }

    @PostMapping("/{id}/confirmation/outcomes")
    @PreAuthorize("hasRole('DRIVER')")
    public PackageDto recordConfirmationOutcome(@PathVariable Long id, @RequestBody ConfirmationOutcomeRequest request,
            Authentication authentication) {
        return publish(id, () -> packageService.recordConfirmationOutcome(id, currentUserId(authentication), request.outcome(),
                request.comment(), request.nextContactAt()));
    }

    @PatchMapping("/{id}/agency-arrival")
    public PackageDto registerAgencyArrival(@PathVariable Long id, Authentication authentication) {
        if (isAdmin(authentication)) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "La reception en agence doit etre enregistree par un livreur.");
        }
        return publish(id, () -> packageService.registerAgencyArrival(id, currentUserId(authentication)));
    }

    @PatchMapping("/drivers/{driverId}/departure")
    @PreAuthorize("hasRole('ADMIN')")
    public DepartureResultDto confirmDriverDeparture(@PathVariable Long driverId, Authentication authentication) {
        int processedCount = packageService.confirmDriverDeparture(driverId, currentUserId(authentication));
        realtimeEventService.refreshRequired();
        return new DepartureResultDto(processedCount);
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public ImportResultDto importExcel(@RequestPart("file") MultipartFile file) {
        String filename = file.getOriginalFilename();
        if (filename != null && filename.toLowerCase(java.util.Locale.ROOT).endsWith(".pdf")) {
            ImportResultDto result = pdfImportService.importPackages(file);
            realtimeEventService.refreshRequired();
            return result;
        }
        ImportResultDto result = excelImportService.importPackages(file);
        realtimeEventService.refreshRequired();
        return result;
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto update(@PathVariable Long id, @RequestBody PackageRequest request,
            Authentication authentication) { return publish(id, () -> packageService.update(id, request, currentUserId(authentication))); }

    @PatchMapping("/{id}/assign/{driverId}")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto assignDriver(@PathVariable Long id, @PathVariable Long driverId) {
        return publish(id, () -> packageService.assignDriver(id, driverId));
    }

    @PatchMapping("/{id}/return")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto registerReturn(@PathVariable Long id) { return publish(id, () -> packageService.registerReturn(id)); }

    @PatchMapping("/{id}/depot-arrival")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto registerDepotArrival(@PathVariable Long id, Authentication authentication) {
        return publish(id, () -> packageService.registerDepotArrival(id, currentUserId(authentication)));
    }

    @PatchMapping("/{id}/depot-decision")
    @PreAuthorize("hasRole('ADMIN')")
    public PackageDto decideDepotStatus(@PathVariable Long id, @RequestParam PackageStatus status,
            @RequestParam(required = false) LocalDate nextDeliveryDate, Authentication authentication) {
        return publish(id, () -> packageService.decideDepotStatus(id, status, nextDeliveryDate, currentUserId(authentication)));
    }

    @PostMapping("/return-shipments")
    @PreAuthorize("hasRole('ADMIN')")
    public List<PackageDto> shipReturns(@RequestBody ReturnShipmentRequest request, Authentication authentication) {
        return publishAll(request.packageIds(), () -> packageService.shipReturns(
                request.packageIds(), request.reference(), currentUserId(authentication)));
    }

    @PatchMapping("/{id}/status")
    public PackageDto updateStatus(@PathVariable Long id, @RequestParam PackageStatus status,
            Authentication authentication) {
        if (isAdmin(authentication)) {
            if (status == PackageStatus.IN_DELIVERY) return publish(id, () -> packageService.startDelivery(id, currentUserId(authentication)));
            if (status == PackageStatus.DELIVERED) return publish(id, () -> packageService.completeDeliveryFromAdmin(id, currentUserId(authentication)));
            throw new IllegalArgumentException("Utilisez le workflow depot pour ce statut.");
        }
        if (status != PackageStatus.DELIVERED) {
            throw new org.springframework.security.access.AccessDeniedException(
                    "Le livreur ne peut pas decider ce statut.");
        }
        return publish(id, () -> packageService.completeDeliveryForDriver(id, currentUserId(authentication)));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        packageService.delete(id);
        realtimeEventService.refreshRequired();
    }

    @DeleteMapping("/bulk")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBulk(@RequestBody List<Long> packageIds) {
        packageService.deleteAll(packageIds);
        realtimeEventService.refreshRequired();
    }

    @GetMapping("/{id}/attempts")
    public List<DeliveryAttemptDto> attempts(@PathVariable Long id, Authentication authentication) {
        if (!isAdmin(authentication)) {
            packageService.verifyDriverCanViewPackage(id, currentUserId(authentication));
        }
        return attemptService.findByPackage(id);
    }

    @PostMapping("/{id}/attempts")
    @ResponseStatus(HttpStatus.CREATED)
    public DeliveryAttemptDto createAttempt(@PathVariable Long id, @RequestBody DeliveryAttemptRequest request,
            Authentication authentication) {
        PackageDto previous = packageService.findById(id);
        Long driverId = isAdmin(authentication) ? request.driverId() : currentUserId(authentication);
        if (driverId == null) {
            throw new IllegalArgumentException("Le livreur est obligatoire.");
        }
        if (!isAdmin(authentication)) {
            packageService.verifyInDeliveryForDriver(id, driverId);
        }
        DeliveryAttemptDto result = attemptService.create(new DeliveryAttemptRequest(id, driverId, request.result(), request.comment(), request.nextDate()));
        realtimeEventService.packageChanged(previous, packageService.findById(id));
        return result;
    }

    @GetMapping("/{id}/history")
    public List<PackageHistoryDto> history(@PathVariable Long id, Authentication authentication) {
        if (!isAdmin(authentication)) {
            packageService.verifyDriverCanViewPackage(id, currentUserId(authentication));
        }
        return historyService.findByPackage(id);
    }

    @PostMapping("/{id}/history")
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public PackageHistoryDto createHistory(@PathVariable Long id, @RequestBody PackageHistoryRequest request,
            @RequestParam PackageStatus newStatus) {
        PackageDto previous = packageService.findById(id);
        PackageHistoryDto result = historyService.create(new PackageHistoryRequest(id, request.userId(), request.comment()), newStatus);
        realtimeEventService.packageChanged(previous, packageService.findById(id));
        return result;
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

    private PackageDto publish(PackageDto packageDto) {
        realtimeEventService.packageChanged(null, packageDto);
        return packageDto;
    }

    private PackageDto publish(Long id, Supplier<PackageDto> operation) {
        PackageDto previous = packageService.findById(id);
        PackageDto current = operation.get();
        realtimeEventService.packageChanged(previous, current);
        return current;
    }

    private List<PackageDto> publishAll(List<Long> ids, Supplier<List<PackageDto>> operation) {
        List<Long> packageIds = ids == null ? List.of() : ids;
        java.util.Map<Long, PackageDto> previous = packageIds.stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .collect(java.util.stream.Collectors.toMap(id -> id, packageService::findById));
        List<PackageDto> changed = operation.get();
        changed.forEach(item -> realtimeEventService.packageChanged(previous.get(item.id()), item));
        return changed;
    }
}
