package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.DriverDailyActivityDto;
import com.delivery.delivery_app.dto.PackageDto;
import com.delivery.delivery_app.entity.UserEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DriverManifestPdfService {
    private static final PDRectangle PAGE_SIZE = PDRectangle.A4;
    private static final PDFont REGULAR = PDType1Font.HELVETICA;
    private static final PDFont BOLD = PDType1Font.HELVETICA_BOLD;
    private static final float MARGIN = 38;
    private static final float ROW_HEIGHT = 34;
    private static final float TABLE_TOP = 650;
    private static final float TABLE_BOTTOM = 86;
    private static final DateTimeFormatter DISPLAY_DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final DeliveryAttemptService attemptService;
    private final UserService userService;

    public DriverManifestPdfService(DeliveryAttemptService attemptService, UserService userService) {
        this.attemptService = attemptService;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public byte[] generate(Long driverId, LocalDate date) {
        UserEntity driver = userService.getUser(driverId);
        return createPdf(driver.getName(), driver.getPhone(), driverId, date,
                attemptService.findDriverDailyActivity(driverId, date));
    }

    byte[] createPdf(String driverName, String driverPhone, Long driverId, LocalDate date,
            List<DriverDailyActivityDto> activities) {
        long delivered = activities.stream().filter(item -> item.activityStatus() == PackageStatus.DELIVERED).count();
        long returned = activities.stream().filter(item -> isReturnedByDriverOn(item.packageData(), driverId, date)).count();
        BigDecimal deliveredAmount = activities.stream()
                .filter(item -> item.activityStatus() == PackageStatus.DELIVERED)
                .map(item -> item.packageData().price()).filter(value -> value != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            int index = 0;
            int pageNumber = 1;
            do {
                PDPage page = new PDPage(PAGE_SIZE);
                document.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    drawHeader(content, driverName, driverPhone, date, activities.size(), delivered, returned,
                            deliveredAmount, pageNumber);
                    float y = TABLE_TOP;
                    drawTableHeader(content, y);
                    y -= 24;
                    while (index < activities.size() && y - ROW_HEIGHT >= TABLE_BOTTOM) {
                        drawRow(content, activities.get(index), index + 1, y, driverId, date);
                        y -= ROW_HEIGHT;
                        index++;
                    }
                    drawFooter(content, pageNumber, index >= activities.size());
                }
                pageNumber++;
            } while (index < activities.size());
            document.save(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Impossible de générer le bon PDF du livreur.", exception);
        }
    }

    private boolean isReturnedByDriverOn(PackageDto parcel, Long driverId, LocalDate date) {
        return driverId.equals(parcel.lastDriverId()) && parcel.returnedToDepotAt() != null
                && parcel.returnedToDepotAt().toLocalDate().equals(date);
    }

    private void drawHeader(PDPageContentStream content, String driverName, String driverPhone, LocalDate date,
            int total, long delivered, long returned, BigDecimal deliveredAmount, int pageNumber) throws IOException {
        fill(content, 0.08f, 0.14f, 0.23f, MARGIN, 744, 519, 60);
        text(content, BOLD, 21, 1, 1, 1, MARGIN + 20, 778, "DELIVERY");
        text(content, BOLD, 15, 1, 1, 1, MARGIN + 20, 757, "BON DU LIVREUR");
        textRight(content, REGULAR, 9, 0.78f, 0.84f, 0.92f, 537, 781,
                "Journée du " + date.format(DISPLAY_DATE));
        textRight(content, REGULAR, 8, 0.78f, 0.84f, 0.92f, 537, 763, "Page " + pageNumber);
        text(content, BOLD, 14, 0.10f, 0.14f, 0.20f, MARGIN, 720, driverName);
        text(content, REGULAR, 9, 0.40f, 0.46f, 0.55f, MARGIN, 704,
                "Téléphone : " + blank(driverPhone));

        float cardY = 663;
        summaryCard(content, MARGIN, cardY, 112, "COLIS DU BON", String.valueOf(total));
        summaryCard(content, 159, cardY, 112, "LIVRÉS", String.valueOf(delivered));
        summaryCard(content, 280, cardY, 112, "RETOURS", String.valueOf(returned));
        summaryCard(content, 401, cardY, 156, "MONTANT LIVRÉ", money(deliveredAmount));
    }

    private void summaryCard(PDPageContentStream content, float x, float y, float width, String label, String value)
            throws IOException {
        fill(content, 0.95f, 0.97f, 1, x, y, width, 31);
        text(content, REGULAR, 7, 0.42f, 0.49f, 0.60f, x + 8, y + 19, label);
        text(content, BOLD, 11, 0.12f, 0.31f, 0.59f, x + 8, y + 7, value);
    }

    private void drawTableHeader(PDPageContentStream content, float y) throws IOException {
        fill(content, 0.12f, 0.31f, 0.59f, MARGIN, y - 18, 519, 22);
        String[] headers = {"N°", "CODE", "DESTINATAIRE / TÉL.", "VILLE / ADRESSE", "MONTANT", "STATUT"};
        float[] x = {43, 64, 147, 282, 420, 478};
        for (int i = 0; i < headers.length; i++) text(content, BOLD, 7, 1, 1, 1, x[i], y - 11, headers[i]);
    }

    private void drawRow(PDPageContentStream content, DriverDailyActivityDto activity, int number, float y,
            Long driverId, LocalDate date)
            throws IOException {
        PackageDto parcel = activity.packageData();
        if (number % 2 == 0) fill(content, 0.97f, 0.98f, 0.99f, MARGIN, y - 29, 519, ROW_HEIGHT);
        line(content, MARGIN, y - 29, 557, y - 29, 0.89f, 0.91f, 0.94f);
        text(content, BOLD, 7, 0.29f, 0.35f, 0.43f, 43, y - 9, String.valueOf(number));
        text(content, BOLD, 7.2f, 0.12f, 0.31f, 0.59f, 64, y - 9, fit(parcel.trackingCode(), 18));
        text(content, BOLD, 7.2f, 0.13f, 0.16f, 0.21f, 147, y - 7, fit(parcel.recipient(), 27));
        text(content, REGULAR, 6.7f, 0.42f, 0.48f, 0.56f, 147, y - 19, fit(parcel.phone(), 25));
        text(content, BOLD, 7, 0.13f, 0.16f, 0.21f, 282, y - 7, fit(parcel.city(), 22));
        text(content, REGULAR, 6.3f, 0.42f, 0.48f, 0.56f, 282, y - 19, fit(parcel.address(), 38));
        text(content, BOLD, 7, 0.13f, 0.16f, 0.21f, 420, y - 9, money(parcel.price()));
        boolean depotReturn = isReturnedByDriverOn(parcel, driverId, date);
        boolean red = depotReturn || statusRed(activity.activityStatus());
        text(content, BOLD, 6.5f, red ? 0.73f : 0.10f, red ? 0.25f : 0.48f, red ? 0.29f : 0.31f,
                478, y - 9, fit(depotReturn ? "RETOUR DÉPÔT" : statusLabel(activity.activityStatus()), 17));
        String comment = firstNonBlank(parcel.latestActionComment(), parcel.confirmationComment(), parcel.importComment());
        if (!comment.isBlank()) text(content, REGULAR, 5.8f, 0.48f, 0.53f, 0.60f, 64, y - 27,
                "Note : " + fit(comment, 83));
    }

    private void drawFooter(PDPageContentStream content, int pageNumber, boolean lastPage) throws IOException {
        if (lastPage) {
            line(content, MARGIN, 58, 225, 58, 0.69f, 0.74f, 0.81f);
            line(content, 370, 58, 557, 58, 0.69f, 0.74f, 0.81f);
            text(content, REGULAR, 7, 0.45f, 0.50f, 0.58f, MARGIN, 46, "Signature du livreur");
            text(content, REGULAR, 7, 0.45f, 0.50f, 0.58f, 370, 46, "Signature de l'administration");
        }
        textRight(content, REGULAR, 6.5f, 0.55f, 0.60f, 0.67f, 557, 25,
                "Bon généré le " + LocalDateTime.now().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))
                        + " · page " + pageNumber);
    }

    private String statusLabel(PackageStatus status) {
        return switch (status) {
            case TO_CONFIRM -> "MIS EN DISTRIBUTION";
            case NO_ANSWER -> "PAS DE RÉPONSE";
            case VOICEMAIL -> "BOÎTE VOCALE";
            case OUT_OF_ZONE -> "HORS ZONE";
            case TO_RECEIVE -> "À RÉCEPTIONNER";
            case AT_AGENCY -> "EN AGENCE";
            case TO_DELIVER -> "À LIVRER";
            case ASSIGNED -> "AFFECTÉ";
            case IN_DELIVERY -> "EN LIVRAISON";
            case DELIVERED -> "LIVRÉ";
            case POSTPONED -> "REPORTÉ";
            case RETURNED -> "RETOUR";
            case RETURN_SHIPPED -> "RETOUR ENVOYÉ";
            case CANCELLED -> "ANNULÉ";
        };
    }

    private boolean statusRed(PackageStatus status) {
        return status == PackageStatus.RETURNED || status == PackageStatus.RETURN_SHIPPED
                || status == PackageStatus.CANCELLED;
    }

    private String money(BigDecimal value) {
        return String.format(Locale.FRANCE, "%.2f DH", value == null ? BigDecimal.ZERO : value);
    }

    private String firstNonBlank(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value;
        return "";
    }

    private String blank(String value) { return value == null || value.isBlank() ? "Non renseigné" : value; }

    private String fit(String value, int maxCharacters) {
        String normalized = safe(blank(value));
        return normalized.length() <= maxCharacters ? normalized : normalized.substring(0, maxCharacters - 1) + "…";
    }

    private String safe(String value) {
        if (value == null) return "";
        StringBuilder result = new StringBuilder();
        for (char character : value.toCharArray()) {
            try {
                REGULAR.encode(String.valueOf(character));
                result.append(character);
            } catch (IOException | IllegalArgumentException exception) {
                result.append('?');
            }
        }
        return result.toString();
    }

    private void text(PDPageContentStream content, PDFont font, float size, float red, float green, float blue,
            float x, float y, String value) throws IOException {
        content.beginText();
        content.setFont(font, size);
        content.setNonStrokingColor(red, green, blue);
        content.newLineAtOffset(x, y);
        content.showText(safe(value));
        content.endText();
    }

    private void textRight(PDPageContentStream content, PDFont font, float size, float red, float green, float blue,
            float right, float y, String value) throws IOException {
        String safeValue = safe(value);
        text(content, font, size, red, green, blue,
                right - font.getStringWidth(safeValue) / 1000 * size, y, safeValue);
    }

    private void fill(PDPageContentStream content, float red, float green, float blue,
            float x, float y, float width, float height) throws IOException {
        content.setNonStrokingColor(red, green, blue);
        content.addRect(x, y, width, height);
        content.fill();
    }

    private void line(PDPageContentStream content, float x1, float y1, float x2, float y2,
            float red, float green, float blue) throws IOException {
        content.setStrokingColor(red, green, blue);
        content.setLineWidth(0.5f);
        content.moveTo(x1, y1);
        content.lineTo(x2, y2);
        content.stroke();
    }
}
