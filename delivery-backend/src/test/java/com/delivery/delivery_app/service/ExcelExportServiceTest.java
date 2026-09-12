package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.repository.PackageRepository;
import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.List;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;

class ExcelExportServiceTest {
    @Test
    void exportsOnlyPackagesCreatedOnTheRequestedDay() throws Exception {
        PackageRepository packageRepository = mock(PackageRepository.class);
        LocalDate date = LocalDate.of(2026, 9, 12);
        PackageEntity packageForToday = new PackageEntity();
        packageForToday.setTrackingCode("TODAY-001");
        packageForToday.setRecipient("Client du jour");
        packageForToday.setCreatedAt(date.atTime(10, 30));
        packageForToday.setUpdatedAt(date.atTime(10, 30));
        when(packageRepository.findByCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
                date.atStartOfDay(), date.plusDays(1).atStartOfDay()))
                .thenReturn(List.of(packageForToday));

        byte[] file = new ExcelExportService(packageRepository).exportPackages(date);

        verify(packageRepository).findByCreatedAtGreaterThanEqualAndCreatedAtLessThanOrderByCreatedAtDesc(
                date.atStartOfDay(), date.plusDays(1).atStartOfDay());
        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(file))) {
            var sheet = workbook.getSheet("Colis");
            assertEquals(1, sheet.getLastRowNum());
            assertEquals("TODAY-001", sheet.getRow(1).getCell(0).getStringCellValue());
        }
    }

    @Test
    void exportsThePackagesDisplayedForTheSelectedDate() throws Exception {
        PackageRepository packageRepository = mock(PackageRepository.class);
        PackageEntity displayedPackage = new PackageEntity();
        displayedPackage.setTrackingCode("DISPLAYED-001");
        displayedPackage.setRecipient("Client affiché");
        when(packageRepository.findByIdInOrderByCreatedAtDesc(List.of(42L)))
                .thenReturn(List.of(displayedPackage));

        byte[] file = new ExcelExportService(packageRepository).exportPackagesByIds(List.of(42L));

        verify(packageRepository).findByIdInOrderByCreatedAtDesc(List.of(42L));
        try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(file))) {
            var sheet = workbook.getSheet("Colis");
            assertEquals(1, sheet.getLastRowNum());
            assertEquals("DISPLAYED-001", sheet.getRow(1).getCell(0).getStringCellValue());
        }
    }
}
