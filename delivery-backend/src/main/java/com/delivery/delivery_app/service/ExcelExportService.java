package com.delivery.delivery_app.service;

import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.repository.PackageRepository;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ExcelExportService {
    private static final String[] HEADERS = {
            "Code de suivi", "Nom du magasin", "Destinataire", "Téléphone", "Ville", "Adresse",
            "Prix (DH)", "Commentaire", "Statut", "Livreur", "Créé le", "Modifié le"
    };

    private final PackageRepository packageRepository;

    public ExcelExportService(PackageRepository packageRepository) {
        this.packageRepository = packageRepository;
    }

    @Transactional(readOnly = true)
    public byte[] exportPackages() {
        List<PackageEntity> packages = packageRepository.findAllByOrderByCreatedAtDesc();
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Colis");
            CellStyle headerStyle = headerStyle(workbook);
            CellStyle dateStyle = workbook.createCellStyle();
            dateStyle.setDataFormat(workbook.getCreationHelper().createDataFormat().getFormat("yyyy-mm-dd hh:mm"));

            Row header = sheet.createRow(0);
            for (int index = 0; index < HEADERS.length; index++) {
                Cell cell = header.createCell(index);
                cell.setCellValue(HEADERS[index]);
                cell.setCellStyle(headerStyle);
            }
            for (int index = 0; index < packages.size(); index++) {
                writePackage(sheet.createRow(index + 1), packages.get(index), dateStyle);
            }
            sheet.createFreezePane(0, 1);
            sheet.setAutoFilter(new org.apache.poi.ss.util.CellRangeAddress(0, packages.size(), 0, HEADERS.length - 1));
            for (int index = 0; index < HEADERS.length; index++) {
                sheet.autoSizeColumn(index);
                sheet.setColumnWidth(index, Math.min(sheet.getColumnWidth(index) + 512, 18000));
            }
            workbook.write(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Impossible de générer le fichier Excel.", exception);
        }
    }

    private CellStyle headerStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setColor((short) 9);
        style.setFont(font);
        style.setFillForegroundColor((short) 22);
        style.setFillPattern(org.apache.poi.ss.usermodel.FillPatternType.SOLID_FOREGROUND);
        return style;
    }

    private void writePackage(Row row, PackageEntity entity, CellStyle dateStyle) {
        int column = 0;
        text(row, column++, entity.getTrackingCode());
        text(row, column++, entity.getStoreName());
        text(row, column++, entity.getRecipient());
        text(row, column++, entity.getPhone());
        text(row, column++, entity.getCity());
        text(row, column++, entity.getAddress());
        if (entity.getPrice() != null) row.createCell(column++).setCellValue(entity.getPrice().doubleValue());
        else column++;
        text(row, column++, entity.getImportComment());
        text(row, column++, statusLabel(entity.getStatus()));
        text(row, column++, entity.getDriver() == null ? null : entity.getDriver().getName());
        date(row, column++, entity.getCreatedAt(), dateStyle);
        date(row, column, entity.getUpdatedAt(), dateStyle);
    }

    private void text(Row row, int column, String value) {
        row.createCell(column).setCellValue(value == null ? "" : value);
    }

    private String statusLabel(com.delivery.delivery_app.enums.PackageStatus status) {
        if (status == null) return "";
        return switch (status) {
            case TO_CONFIRM -> "MIS EN DISTRIBUTION";
            case NO_ANSWER -> "PAS DE REPONSE";
            case VOICEMAIL -> "BOITE VOCALE";
            case OUT_OF_ZONE -> "HORS ZONE";
            case TO_RECEIVE -> "A RECEPTIONNER";
            case AT_AGENCY -> "EN AGENCE";
            case TO_DELIVER -> "A LIVRER";
            case ASSIGNED -> "AFFECTE";
            case IN_DELIVERY -> "EN LIVRAISON";
            case DELIVERED -> "LIVRE";
            case POSTPONED -> "REPORTE";
            case RETURNED -> "RETOUR";
            case RETURN_SHIPPED -> "RETOUR ENVOYE";
            case CANCELLED -> "ANNULE";
        };
    }

    private void date(Row row, int column, java.time.LocalDateTime value, CellStyle style) {
        Cell cell = row.createCell(column);
        if (value != null) {
            cell.setCellValue(java.sql.Timestamp.valueOf(value));
            cell.setCellStyle(style);
        }
    }
}
