package com.delivery.delivery_app.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.delivery.delivery_app.dto.DriverDailyActivityDto;
import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.enums.PackageStatus;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class DriverManifestPdfServiceTest {
    @Test
    void createsAPaginatedManifestWithDailyTotalsAndSignatures() throws Exception {
        LocalDate date = LocalDate.of(2026, 9, 5);
        List<DriverDailyActivityDto> activities = new ArrayList<>();
        for (int index = 1; index <= 20; index++) {
            PackageStatus status = index <= 12 ? PackageStatus.DELIVERED
                    : index <= 15 ? PackageStatus.AT_AGENCY : PackageStatus.IN_DELIVERY;
            activities.add(new DriverDailyActivityDto(parcel(index, status, index >= 13 && index <= 15, date), status,
                    date.atTime(18, index)));
        }

        byte[] pdf = new DriverManifestPdfService(null, null)
                .createPdf("Oussama", "0753052743", 7L, date, activities);

        assertThat(pdf).startsWith("%PDF".getBytes());
        Files.createDirectories(Path.of("target"));
        Files.write(Path.of("target/driver-manifest-preview.pdf"), pdf);
        try (PDDocument document = PDDocument.load(pdf)) {
            assertThat(document.getNumberOfPages()).isEqualTo(2);
            String text = new PDFTextStripper().getText(document);
            assertThat(text).contains("BON DU LIVREUR", "Oussama", "COLIS DU BON", "20", "LIVRÉS", "12",
                    "RETOURS\n3", "RETOUR DÉPÔT", "Signature du livreur", "TRACK-020");
        }
    }

    private PackageDto parcel(int index, PackageStatus status, boolean returned, LocalDate date) {
        LocalDateTime now = date.atTime(20, index);
        return new PackageDto((long) index, "TRACK-" + String.format("%03d", index), "Magasin " + index,
                "Client " + index, "06123456" + String.format("%02d", index), "Casablanca",
                "Quartier exemple, rue " + index, BigDecimal.valueOf(100L + index),
                "Remarque de livraison " + index, null, null, null, null, null, null, null, null, status,
                returned ? null : 7L, returned ? 7L : null, null, null, false, null, null, null, null,
                returned ? now : null, returned, now.minusHours(4), now.minusHours(3), null, null, null,
                now.minusDays(1), now);
    }
}
