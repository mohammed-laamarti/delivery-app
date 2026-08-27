package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.dto.ImportResultDto;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.repository.PackageRepository;
import java.io.ByteArrayOutputStream;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

class ExcelImportServiceTest {
    @Test
    void importsAParcelWithZeroPrice() throws Exception {
        PackageRepository packageRepository = mock(PackageRepository.class);
        when(packageRepository.existsByTrackingCode("ZERO-001")).thenReturn(false);
        when(packageRepository.save(any(PackageEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));
        ExcelImportService service = new ExcelImportService(packageRepository);

        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            var sheet = workbook.createSheet();
            var header = sheet.createRow(0);
            String[] headers = {"code suivi", "destinataire", "telephone", "ville", "adresse", "prix"};
            for (int index = 0; index < headers.length; index++) header.createCell(index).setCellValue(headers[index]);
            var row = sheet.createRow(1);
            row.createCell(0).setCellValue("ZERO-001");
            row.createCell(1).setCellValue("Client test");
            row.createCell(2).setCellValue("0600000000");
            row.createCell(3).setCellValue("Casablanca");
            row.createCell(4).setCellValue("Adresse test");
            row.createCell(5).setCellValue(0);
            workbook.write(output);

            ImportResultDto result = service.importPackages(new MockMultipartFile(
                    "file", "colis.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    output.toByteArray()));

            assertEquals(1, result.imported());
            assertEquals(0, result.skipped());
        }
    }
}
