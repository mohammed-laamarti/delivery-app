package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.ImportResultDto;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.PackageRepository;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Transactional
public class ExcelImportService {
    private final PackageRepository packageRepository;

    public ExcelImportService(PackageRepository packageRepository) {
        this.packageRepository = packageRepository;
    }

    public ImportResultDto importPackages(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Le fichier Excel est vide.");
        }

        int imported = 0;
        int skipped = 0;
        List<String> errors = new ArrayList<>();
        DataFormatter formatter = new DataFormatter(Locale.US);

        try (var workbook = WorkbookFactory.create(file.getInputStream())) {
            Sheet sheet = workbook.getSheetAt(0);
            Map<String, Integer> columns = readHeaders(sheet.getRow(0), formatter);
            validateHeaders(columns);

            for (int rowIndex = 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null || isEmpty(row, formatter)) {
                    continue;
                }
                String trackingCode = cell(row, columns, "tracking_code", formatter);
                if (trackingCode.isBlank()) {
                    errors.add("Ligne " + (rowIndex + 1) + ": code suivi manquant");
                    skipped++;
                    continue;
                }
                if (packageRepository.existsByTrackingCode(trackingCode)) {
                    skipped++;
                    continue;
                }

                BigDecimal price;
                try {
                    price = parsePrice(cell(row, columns, "price", formatter));
                } catch (IllegalArgumentException exception) {
                    errors.add("Ligne " + (rowIndex + 1) + ": " + exception.getMessage());
                    skipped++;
                    continue;
                }

                PackageEntity entity = new PackageEntity();
                entity.setTrackingCode(trackingCode);
                entity.setRecipient(cell(row, columns, "recipient", formatter));
                entity.setPhone(cell(row, columns, "phone", formatter));
                entity.setCity(cell(row, columns, "city", formatter));
                entity.setAddress(cell(row, columns, "address", formatter));
                entity.setPrice(price);
                entity.setImportComment(cell(row, columns, "import_comment", formatter));
                entity.setStatus(PackageStatus.TO_DELIVER);
                entity.setCreatedAt(LocalDateTime.now());
                entity.setUpdatedAt(LocalDateTime.now());
                packageRepository.save(entity);
                imported++;
            }
        } catch (IOException | RuntimeException exception) {
            throw new IllegalArgumentException("Impossible de lire le fichier Excel: " + exception.getMessage(), exception);
        }

        return new ImportResultDto(imported, skipped, errors);
    }

    private Map<String, Integer> readHeaders(Row header, DataFormatter formatter) {
        Map<String, Integer> columns = new HashMap<>();
        if (header == null) return columns;
        for (int i = 0; i < header.getLastCellNum(); i++) {
            String normalized = normalize(formatter.formatCellValue(header.getCell(i)));
            String key = switch (normalized) {
                case "code suivi", "code_suivi", "tracking code", "tracking_code" -> "tracking_code";
                case "destinataire", "recipient" -> "recipient";
                case "telephone", "phone" -> "phone";
                case "ville", "city" -> "city";
                case "adresse", "address" -> "address";
                case "prix", "price" -> "price";
                case "commentaire", "comment", "import_comment" -> "import_comment";
                default -> normalized;
            };
            columns.put(key, i);
        }
        return columns;
    }

    private void validateHeaders(Map<String, Integer> columns) {
        List<String> required = List.of("tracking_code", "recipient", "phone", "city", "address", "price");
        List<String> missing = required.stream().filter((header) -> !columns.containsKey(header)).toList();
        if (!missing.isEmpty()) throw new IllegalArgumentException("Colonnes manquantes: " + String.join(", ", missing));
    }

    private String cell(Row row, Map<String, Integer> columns, String name, DataFormatter formatter) {
        Integer index = columns.get(name);
        return index == null ? "" : formatter.formatCellValue(row.getCell(index)).trim();
    }

    private BigDecimal parsePrice(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("prix manquant");
        }

        String compact = value.replace("\u00A0", "").replaceAll("\\s+", "")
                .replaceAll("[^0-9,.-]", "");
        if (compact.isBlank() || compact.equals("-") || compact.indexOf('-') > 0
                || compact.chars().filter(character -> character == '-').count() > 1) {
            throw new IllegalArgumentException("prix invalide");
        }

        int lastComma = compact.lastIndexOf(',');
        int lastDot = compact.lastIndexOf('.');
        int decimalIndex = decimalSeparatorIndex(compact, lastComma, lastDot);
        String normalized;
        if (decimalIndex >= 0) {
            String integerPart = compact.substring(0, decimalIndex).replace(",", "").replace(".", "");
            String decimalPart = compact.substring(decimalIndex + 1);
            if (integerPart.isBlank() || decimalPart.isBlank() || !decimalPart.matches("\\d+")) {
                throw new IllegalArgumentException("prix invalide");
            }
            normalized = integerPart + "." + decimalPart;
        } else {
            normalized = compact.replace(",", "").replace(".", "");
        }

        try {
            BigDecimal price = new BigDecimal(normalized);
            if (price.signum() <= 0) {
                throw new IllegalArgumentException("prix doit etre superieur a 0");
            }
            return price;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("prix invalide");
        }
    }

    private int decimalSeparatorIndex(String value, int lastComma, int lastDot) {
        if (lastComma >= 0 && lastDot >= 0) return Math.max(lastComma, lastDot);
        int separator = Math.max(lastComma, lastDot);
        if (separator < 0) return -1;

        int digitsAfterSeparator = value.length() - separator - 1;
        // Une seule séparation suivie de trois chiffres est un séparateur de milliers : 1.250 ou 1,250.
        return digitsAfterSeparator == 3 ? -1 : separator;
    }

    private boolean isEmpty(Row row, DataFormatter formatter) {
        for (int i = 0; i < row.getLastCellNum(); i++) if (!formatter.formatCellValue(row.getCell(i)).isBlank()) return false;
        return true;
    }

    private String normalize(String value) {
        return java.text.Normalizer.normalize(value.toLowerCase(Locale.ROOT).trim(), java.text.Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").replaceAll("\\s+", " ");
    }
}
