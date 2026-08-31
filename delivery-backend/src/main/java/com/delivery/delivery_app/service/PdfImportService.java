package com.delivery.delivery_app.service;

import com.delivery.delivery_app.dto.ImportResultDto;
import com.delivery.delivery_app.entity.PackageEntity;
import com.delivery.delivery_app.enums.PackageStatus;
import com.delivery.delivery_app.repository.PackageRepository;
import java.io.IOException;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** Imports Ozon Express distribution slips that contain a selectable text table. */
@Service
@Transactional
public class PdfImportService {
    private static final Pattern PHONE_PATTERN = Pattern.compile("(?<!\\d)0?\\d{9,10}(?!\\d)");
    private static final Pattern ADDRESS_PATTERN = Pattern.compile("(?is)adresse\\s*:\\s*(.*?)(?=commentaire\\s*:|$)");
    private static final Pattern COMMENT_PATTERN = Pattern.compile("(?is)commentaire\\s*:\\s*(.*)$");
    private static final Pattern CITY_PATTERN = Pattern.compile("(?is)^\\s*(.*?)(?=adresse\\s*:|$)");
    // This Ozon PDF stores Arabic glyphs as visual presentation forms rather than Unicode text.
    // We can recover those glyph codes directly from the PDF and reverse the visual run.
    private static final Pattern VISUAL_ARABIC_RUN = Pattern.compile("[\\uFB50-\\uFEFC]+(?:\\s+[\\uFB50-\\uFEFC]+)*");

    private final PackageRepository packageRepository;

    public PdfImportService(PackageRepository packageRepository) {
        this.packageRepository = packageRepository;
    }

    public ImportResultDto importPackages(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Le fichier PDF est vide.");
        }
        if (!isPdf(file)) {
            throw new IllegalArgumentException("Le fichier doit etre un PDF.");
        }

        List<String> errors = new ArrayList<>();
        int imported = 0;
        int skipped = 0;
        try (PDDocument document = PDDocument.load(file.getBytes())) {
            List<SlipRow> rows = new DistributionSlipStripper().read(document);
            if (rows.isEmpty()) {
                throw new IllegalArgumentException("Aucun colis n'a ete trouve. Utilisez un bon de distribution Ozon Express au format PDF texte.");
            }
            for (SlipRow row : rows) {
                if (row.trackingCode().isBlank()) {
                    errors.add("Ligne " + row.number() + ": code suivi manquant");
                    skipped++;
                    continue;
                }
                if (packageRepository.existsByTrackingCode(row.trackingCode())) {
                    skipped++;
                    continue;
                }
                try {
                    PackageEntity entity = new PackageEntity();
                    entity.setTrackingCode(row.trackingCode());
                    entity.setStoreName(row.storeName());
                    entity.setRecipient(row.recipient());
                    entity.setPhone(row.phone());
                    entity.setCity(row.city());
                    entity.setAddress(row.address());
                    entity.setPrice(row.price());
                    entity.setImportComment(row.comment());
                    entity.setStatus(PackageStatus.TO_CONFIRM);
                    entity.setCreatedAt(LocalDateTime.now());
                    entity.setUpdatedAt(LocalDateTime.now());
                    packageRepository.save(entity);
                    imported++;
                } catch (RuntimeException exception) {
                    errors.add("Ligne " + row.number() + ": " + exception.getMessage());
                    skipped++;
                }
            }
        } catch (IOException exception) {
            throw new IllegalArgumentException("Impossible de lire le fichier PDF: " + exception.getMessage(), exception);
        }
        return new ImportResultDto(imported, skipped, errors);
    }

    private boolean isPdf(MultipartFile file) {
        String name = file.getOriginalFilename();
        return name != null && name.toLowerCase(Locale.ROOT).endsWith(".pdf");
    }

    private record Word(int page, float x, float y, String text) { }

    private record RawRow(int page, float y, int number) { }

    private record SlipRow(int number, String trackingCode, String storeName, String recipient, String phone, String city,
            String address, BigDecimal price, String comment) { }

    private static class DistributionSlipStripper extends PDFTextStripper {
        private final List<Word> words = new ArrayList<>();
        private int currentPage;

        DistributionSlipStripper() throws IOException {
            setSortByPosition(true);
        }

        List<SlipRow> read(PDDocument document) throws IOException {
            for (int page = 1; page <= document.getNumberOfPages(); page++) {
                currentPage = page;
                setStartPage(page);
                setEndPage(page);
                getText(document);
            }
            return buildRows();
        }

        @Override
        protected void writeString(String text, List<TextPosition> positions) {
            if (positions.isEmpty() || text.isBlank()) return;
            TextPosition first = positions.getFirst();
            words.add(new Word(currentPage, first.getXDirAdj(), first.getYDirAdj(), decodeText(positions).trim()));
        }

        private String decodeText(List<TextPosition> positions) {
            StringBuilder raw = new StringBuilder();
            for (TextPosition position : positions) {
                int[] codes = position.getCharacterCodes();
                if (codes.length == 1 && codes[0] >= 0xFB50 && codes[0] <= 0xFEFC) {
                    raw.appendCodePoint(codes[0]);
                } else {
                    raw.append(position.getUnicode());
                }
            }
            Matcher matcher = VISUAL_ARABIC_RUN.matcher(raw);
            StringBuffer decoded = new StringBuffer();
            while (matcher.find()) {
                String logical = Normalizer.normalize(new StringBuilder(matcher.group()).reverse().toString(),
                        Normalizer.Form.NFKC);
                matcher.appendReplacement(decoded, Matcher.quoteReplacement(logical));
            }
            matcher.appendTail(decoded);
            return decoded.toString();
        }

        private List<SlipRow> buildRows() {
            List<RawRow> rows = words.stream()
                    .filter(word -> word.x() >= 25 && word.x() < 55 && word.text().matches("\\d+"))
                    .map(word -> new RawRow(word.page(), word.y(), Integer.parseInt(word.text())))
                    .sorted(Comparator.comparingInt(RawRow::page).thenComparing(RawRow::y))
                    .toList();
            List<SlipRow> result = new ArrayList<>();
            for (int index = 0; index < rows.size(); index++) {
                RawRow row = rows.get(index);
                float nextY = index + 1 < rows.size() && rows.get(index + 1).page() == row.page()
                        ? rows.get(index + 1).y() : Float.MAX_VALUE;
                List<Word> rowWords = words.stream()
                        .filter(word -> word.page() == row.page() && word.y() >= row.y() - 4 && word.y() < nextY - 2)
                        .sorted(Comparator.comparing(Word::y).thenComparing(Word::x))
                        .toList();
                String tracking = column(rowWords, 55, 163).replaceAll("\\s+", "").trim();
                String storeName = column(rowWords, 163, 244);
                String contact = column(rowWords, 244, 325);
                String information = column(rowWords, 325, 514)
                        .replaceAll("(?s)\\s+\\d+\\s*/\\s*\\d+.*$", "");
                if (index + 1 < rows.size() && rows.get(index + 1).page() != row.page()) {
                    String continuedComment = commentAtTopOfNextPage(rows.get(index + 1));
                    if (!continuedComment.isBlank()) {
                        information += " " + continuedComment;
                    }
                }
                String amount = column(rowWords, 514, 570);
                if (tracking.isBlank() || amount.isBlank()) continue;

                String phone = findPhone(contact);
                String recipient = cleanRecipient(contact.replaceAll("(?<!\\d)0?\\d{9,10}(?!\\d)", ""));
                if (recipient.isBlank()) recipient = cleanStoreName(storeName);
                String city = extract(CITY_PATTERN, information);
                String address = extract(ADDRESS_PATTERN, information);
                String comment = extract(COMMENT_PATTERN, information);
                result.add(new SlipRow(row.number(), tracking, cleanStoreName(storeName), recipient, phone, city, address,
                        parsePrice(amount), comment.isBlank() ? null : comment));
            }
            return result;
        }

        /**
         * A long row can finish at the bottom of a page, with only its "Commentaire" line
         * printed above the first numbered row of the following page. Attach that continuation
         * only when it is explicitly a comment, so page headers are never merged into a parcel.
         */
        private String commentAtTopOfNextPage(RawRow nextRow) {
            List<Word> leadingInformation = words.stream()
                    .filter(word -> word.page() == nextRow.page() && word.y() < nextRow.y() - 2
                            && word.x() >= 325 && word.x() < 514)
                    .sorted(Comparator.comparing(Word::y).thenComparing(Word::x))
                    .toList();
            String value = column(leadingInformation, 325, 514);
            return COMMENT_PATTERN.matcher(value).find() ? value : "";
        }

        private String column(List<Word> words, float start, float end) {
            return words.stream().filter(word -> word.x() >= start && word.x() < end)
                    .map(Word::text).reduce((left, right) -> left + " " + right).orElse("");
        }

        private String findPhone(String value) {
            Matcher matcher = PHONE_PATTERN.matcher(value.replaceAll("\\s+", ""));
            return matcher.find() ? matcher.group() : "";
        }

        private String cleanRecipient(String value) {
            return value.replaceAll("(?i)t[ée]l[ée]phone\\s*:?", "").replaceAll("\\s+", " ").trim();
        }

        private String cleanStoreName(String value) {
            return value.replaceAll("(?<!\\d)0?\\d{9,10}(?!\\d)", "").replaceAll("\\s+", " ").trim();
        }

        private String extract(Pattern pattern, String value) {
            Matcher matcher = pattern.matcher(value);
            return matcher.find() ? matcher.group(1).replaceAll("\\s+", " ").trim() : "";
        }

        private BigDecimal parsePrice(String value) {
            String numeric = value.replaceAll("(?i)dh", "").replaceAll("[^0-9,.-]", "").replace(',', '.').trim();
            if (numeric.isBlank()) throw new IllegalArgumentException("prix manquant");
            try {
                return new BigDecimal(numeric);
            } catch (NumberFormatException exception) {
                throw new IllegalArgumentException("prix invalide");
            }
        }
    }
}
