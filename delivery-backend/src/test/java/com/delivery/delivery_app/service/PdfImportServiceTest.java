package com.delivery.delivery_app.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.repository.PackageRepository;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.mock.web.MockMultipartFile;

class PdfImportServiceTest {
    @Test
    void importsWrappedRowNumbersAndTrackingCodesWithoutImportingTotal() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            try (var content = new PDPageContentStream(document, page)) {
                parcel(content, "99", "PARCEL99", 50, "430 DH");
                parcel(content, "10", "PARCEL100", 90, "270 DH");
                text(content, 34, 100, "0");
                text(content, 61, 100, "82489");
                parcel(content, "10", "PARCEL101", 130, "270 DH");
                text(content, 34, 140, "1");
                text(content, 61, 140, "72489");
                text(content, 480, 170, "Total");
                text(content, 520, 170, "26212 DH");
            }
            List<PackageEntity> saved = importDocument(document);
            assertEquals(List.of("PARCEL99", "PARCEL10082489", "PARCEL10172489"),
                    saved.stream().map(PackageEntity::getTrackingCode).toList());
            assertEquals(List.of(new BigDecimal("430"), new BigDecimal("270"), new BigDecimal("270")),
                    saved.stream().map(PackageEntity::getPrice).toList());
            assertEquals("test", saved.getLast().getAddress());
        }
    }

    @Test
    void excludesTotalFromLastParcelAndKeepsNumericCodesAndZeroPrices() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            try (var content = new PDPageContentStream(document, page)) {
                parcel(content, "1", "8420990", 50, "0 DH");
                text(content, 480, 90, "Total");
                text(content, 520, 90, "0 DH");
            }
            List<PackageEntity> saved = importDocument(document);
            assertEquals(1, saved.size());
            assertEquals("8420990", saved.getFirst().getTrackingCode());
            assertEquals(BigDecimal.ZERO, saved.getFirst().getPrice());
            assertEquals("test", saved.getFirst().getAddress());
        }
    }

    @Test
    void preservesCommentContinuationAcrossPages() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage first = new PDPage(PDRectangle.A4);
            document.addPage(first);
            try (var content = new PDPageContentStream(document, first)) {
                parcel(content, "1", "FIRST", 750, "100 DH");
            }
            PDPage second = new PDPage(PDRectangle.A4);
            document.addPage(second);
            try (var content = new PDPageContentStream(document, second)) {
                text(content, 330, 30, "Commentaire : appeler avant");
                parcel(content, "2", "SECOND", 60, "200 DH");
                text(content, 480, 100, "Total");
                text(content, 520, 100, "300 DH");
            }
            List<PackageEntity> saved = importDocument(document);
            assertEquals(2, saved.size());
            assertEquals("appeler avant", saved.getFirst().getImportComment());
            assertEquals(new BigDecimal("200"), saved.getLast().getPrice());
        }
    }

    @Test
    @EnabledIfSystemProperty(named = "pdf.regression.file", matches = ".+")
    void importsReportedDistributionSlip() throws Exception {
        List<PackageEntity> saved = importBytes(Files.readAllBytes(Path.of(System.getProperty("pdf.regression.file"))));
        assertEquals(101, saved.size());
        assertEquals(new BigDecimal("26212"), saved.stream().map(PackageEntity::getPrice)
                .reduce(BigDecimal.ZERO, BigDecimal::add));
        assertEquals("THL0926B19080JT1282489", saved.get(99).getTrackingCode());
        assertEquals("THL0926B19080EK8972489", saved.get(100).getTrackingCode());
        assertTrue(saved.stream().noneMatch(parcel -> parcel.getTrackingCode().equals("72489")));
    }

    private List<PackageEntity> importDocument(PDDocument document) throws Exception {
        try (var output = new ByteArrayOutputStream()) {
            document.save(output);
            return importBytes(output.toByteArray());
        }
    }

    private List<PackageEntity> importBytes(byte[] bytes) {
        PackageRepository repository = mock(PackageRepository.class);
        List<PackageEntity> saved = new ArrayList<>();
        when(repository.save(any(PackageEntity.class))).thenAnswer(invocation -> {
            PackageEntity entity = invocation.getArgument(0);
            saved.add(entity);
            return entity;
        });
        var result = new PdfImportService(repository).importPackages(
                new MockMultipartFile("file", "distribution.PDF", "application/pdf", bytes));
        assertEquals(saved.size(), result.imported());
        assertEquals(0, result.skipped());
        assertTrue(result.errors().isEmpty());
        return saved;
    }

    private void parcel(PDPageContentStream content, String number, String tracking, float y, String amount)
            throws Exception {
        text(content, 34, y, number);
        text(content, 61, y, tracking);
        text(content, 170, y, "Magasin test");
        text(content, 250, y, "0600000000");
        text(content, 330, y, "Ville : Tahla");
        text(content, 330, y + 10, "Adresse : test");
        text(content, 520, y, amount);
    }

    private void text(PDPageContentStream content, float x, float y, String value) throws Exception {
        content.beginText();
        content.setFont(PDType1Font.HELVETICA, 8);
        content.newLineAtOffset(x, PDRectangle.A4.getHeight() - y);
        content.showText(value);
        content.endText();
    }
}
