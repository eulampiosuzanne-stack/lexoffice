package br.com.lexoffice.icpbridge;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import javax.swing.*;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureInterface;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureOptions;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.ASN1Sequence;
import org.bouncycastle.asn1.cms.Attribute;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.demoiselle.signer.policy.engine.factory.PolicyFactory.Policies;
import org.demoiselle.signer.policy.impl.pades.pkcs7.impl.PAdESSigner;

public final class BridgeMain {
    static final String VERSION = "2.0.0";
    static final String HOST = "127.0.0.1";
    static final int PORT = 17681;
    static final long MAX_PDF_BYTES = 25L * 1024L * 1024L;
    static final long NONCE_TTL_MS = 120000L;
    static final String POLICY_OID = "2.16.76.1.7.1.11.1.3";
    static final String SIG_POLICY_ATTR_OID = "1.2.840.113549.1.9.16.2.15";
    static final String KEYSTORE_TYPE = env("LEXOFFICE_KEYSTORE_TYPE", "PKCS11");
    static final String DLL = env("LEXOFFICE_PKCS11_DLL", "C:\\Windows\\System32\\aetpkss1.dll");
    static final SecureRandom RNG = new SecureRandom();
    static final ConcurrentHashMap<String, Long> NONCES = new ConcurrentHashMap<String, Long>();
    static volatile Provider pkcs11Provider;

    public static void main(String[] args) throws Exception {
        System.setProperty("java.awt.headless", "false");
        if (Security.getProvider("BC") == null) Security.addProvider(new org.bouncycastle.jce.provider.BouncyCastleProvider());
        HttpServer server = HttpServer.create(new InetSocketAddress(HOST, PORT), 0);
        server.createContext("/health", BridgeMain::health);
        server.createContext("/challenge", BridgeMain::challenge);
        server.createContext("/certificates", BridgeMain::certificates);
        server.createContext("/sign/pades", BridgeMain::sign);
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        server.start();
        audit("START", null, null, "OK", "bridge=" + VERSION + ";keystore=" + KEYSTORE_TYPE);
        System.out.println("LEXOFFICE ICP-Brasil Bridge " + VERSION + " ativo em http://" + HOST + ":" + PORT);
    }

    static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.trim().isEmpty() ? fallback : value.trim();
    }

    static boolean isCloud() { return "WINDOWS-MY".equalsIgnoreCase(KEYSTORE_TYPE); }

    static boolean allowedOrigin(String origin) {
        if (origin == null) return false;
        return "https://lexoffice-alexandreeulampio-2265.vercel.app".equals(origin)
            || "https://lexoffice-git-main-alexandreeulampio-2265.vercel.app".equals(origin)
            || "https://lexoffice-ashy.vercel.app".equals(origin)
            || "https://lexoffice.univittagroup.com.br".equals(origin)
            || origin.startsWith("http://localhost:")
            || origin.startsWith("http://127.0.0.1:");
    }

    static boolean validHost(HttpExchange x) {
        String host = x.getRequestHeaders().getFirst("Host");
        return host != null && (host.equals("127.0.0.1:" + PORT) || host.equals("localhost:" + PORT));
    }

    static void cors(HttpExchange x) {
        String origin = x.getRequestHeaders().getFirst("Origin");
        if (allowedOrigin(origin)) {
            x.getResponseHeaders().set("Access-Control-Allow-Origin", origin);
            x.getResponseHeaders().set("Vary", "Origin");
        }
        x.getResponseHeaders().set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        x.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type,X-Lexoffice-Nonce");
        x.getResponseHeaders().set("Access-Control-Expose-Headers", "X-Lexoffice-Validation,X-Lexoffice-Policy,X-Lexoffice-Certificate-Fingerprint,X-Lexoffice-Bridge-Version");
        x.getResponseHeaders().set("Access-Control-Allow-Private-Network", "true");
        x.getResponseHeaders().set("Cache-Control", "no-store");
        x.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
    }

    static boolean preflight(HttpExchange x) throws IOException {
        cors(x);
        if ("OPTIONS".equalsIgnoreCase(x.getRequestMethod())) {
            if (!validHost(x) || !allowedOrigin(x.getRequestHeaders().getFirst("Origin"))) {
                json(x, 403, "{\"error\":\"origin blocked\"}");
            } else {
                x.sendResponseHeaders(204, -1);
                x.close();
            }
            return true;
        }
        return false;
    }

    static void health(HttpExchange x) throws IOException {
        if (preflight(x)) return;
        if (!validHost(x) || !"GET".equalsIgnoreCase(x.getRequestMethod())) { json(x, 405, "{\"error\":\"method not allowed\"}"); return; }
        String origin = x.getRequestHeaders().getFirst("Origin");
        if (origin != null && !allowedOrigin(origin)) { json(x, 403, "{\"error\":\"origin blocked\"}"); return; }
        json(x, 200, "{\"ok\":true,\"service\":\"LEXOFFICE ICP-Brasil Bridge\",\"version\":\"" + VERSION + "\",\"bind\":\"127.0.0.1\",\"keystore\":\"" + esc(KEYSTORE_TYPE) + "\",\"policy\":\"AD_RB_PADES_1_3\",\"policy_oid\":\"" + POLICY_OID + "\",\"pin_local_only\":true,\"nonce_required\":true}");
    }

    static void challenge(HttpExchange x) throws IOException {
        if (preflight(x)) return;
        if (!validHost(x) || !"GET".equalsIgnoreCase(x.getRequestMethod())) { json(x, 405, "{\"error\":\"method not allowed\"}"); return; }
        String origin = x.getRequestHeaders().getFirst("Origin");
        if (!allowedOrigin(origin)) { json(x, 403, "{\"error\":\"origin blocked\"}"); return; }
        cleanupNonces();
        byte[] raw = new byte[32]; RNG.nextBytes(raw);
        String nonce = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        NONCES.put(nonce, System.currentTimeMillis() + NONCE_TTL_MS);
        json(x, 200, "{\"nonce\":\"" + nonce + "\",\"expires_in_ms\":" + NONCE_TTL_MS + "}");
    }

    static boolean authorizeProtected(HttpExchange x) throws IOException {
        if (!validHost(x)) { json(x, 403, "{\"error\":\"invalid host\"}"); return false; }
        String origin = x.getRequestHeaders().getFirst("Origin");
        if (!allowedOrigin(origin)) { json(x, 403, "{\"error\":\"origin blocked\"}"); return false; }
        String nonce = x.getRequestHeaders().getFirst("X-Lexoffice-Nonce");
        Long expiry = nonce == null ? null : NONCES.remove(nonce);
        if (expiry == null || expiry.longValue() < System.currentTimeMillis()) { json(x, 401, "{\"error\":\"challenge invalid or expired\"}"); return false; }
        return true;
    }

    static void cleanupNonces() {
        long now = System.currentTimeMillis();
        for (Map.Entry<String, Long> e : NONCES.entrySet()) if (e.getValue() < now) NONCES.remove(e.getKey());
    }

    static synchronized Provider pkcs11() throws Exception {
        if (pkcs11Provider != null) return pkcs11Provider;
        if (!new File(DLL).isFile()) throw new FileNotFoundException("SafeSign PKCS#11 nao encontrado em " + DLL);
        String cfg = "name=LexofficeA3\nlibrary=" + DLL.replace("\\", "/") + "\n";
        try {
            java.lang.reflect.Constructor<?> c = Class.forName("sun.security.pkcs11.SunPKCS11").getConstructor(InputStream.class);
            pkcs11Provider = (Provider)c.newInstance(new ByteArrayInputStream(cfg.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchMethodException ex) {
            Provider base = Security.getProvider("SunPKCS11");
            if (base == null) throw new GeneralSecurityException("SunPKCS11 indisponivel no Java.");
            File f = File.createTempFile("lexoffice-p11-", ".cfg");
            Files.write(f.toPath(), cfg.getBytes(StandardCharsets.UTF_8));
            pkcs11Provider = base.configure(f.getAbsolutePath());
            f.deleteOnExit();
        }
        Security.addProvider(pkcs11Provider);
        return pkcs11Provider;
    }

    static Provider signingProvider() throws Exception {
        if (!isCloud()) return pkcs11();
        Provider p = Security.getProvider("SunMSCAPI");
        if (p == null) {
            p = (Provider)Class.forName("sun.security.mscapi.SunMSCAPI").getDeclaredConstructor().newInstance();
            Security.addProvider(p);
        }
        return p;
    }

    static KeyStore store(char[] pin) throws Exception {
        KeyStore k = isCloud() ? KeyStore.getInstance("Windows-MY", signingProvider()) : KeyStore.getInstance("PKCS11", pkcs11());
        k.load(null, isCloud() ? null : pin);
        return k;
    }

    static void certificates(HttpExchange x) throws IOException {
        if (preflight(x)) return;
        if (!"GET".equalsIgnoreCase(x.getRequestMethod())) { json(x, 405, "{\"error\":\"method not allowed\"}"); return; }
        if (!authorizeProtected(x)) return;
        char[] pin = null;
        try {
            pin = isCloud() ? new char[0] : askPin("Para acessar os metadados publicos do certificado A3, informe o PIN localmente.");
            if (!isCloud() && pin == null) throw new IllegalStateException("Operacao cancelada.");
            KeyStore k = store(pin);
            List<String> out = new ArrayList<String>();
            Enumeration<String> aliases = k.aliases();
            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                Certificate c = k.getCertificate(alias);
                if (c instanceof X509Certificate && k.isKeyEntry(alias)) {
                    X509Certificate z = (X509Certificate)c;
                    out.add("{\"subject\":\"" + esc(z.getSubjectX500Principal().getName()) + "\",\"issuer\":\"" + esc(z.getIssuerX500Principal().getName()) + "\",\"serial\":\"" + z.getSerialNumber().toString(16).toUpperCase(Locale.ROOT) + "\",\"fingerprint\":\"" + fingerprint(z) + "\",\"notBefore\":\"" + z.getNotBefore().getTime() + "\",\"notAfter\":\"" + z.getNotAfter().getTime() + "\"}");
                }
            }
            audit("CERTIFICATES", x.getRequestHeaders().getFirst("Origin"), null, "OK", "count=" + out.size());
            json(x, 200, "{\"certificates\":[" + join(out) + "]}");
        } catch (Exception e) {
            audit("CERTIFICATES", x.getRequestHeaders().getFirst("Origin"), null, "ERROR", msg(e));
            json(x, 500, "{\"error\":\"" + esc(msg(e)) + "\"}");
        } finally { wipe(pin); }
    }

    static void sign(HttpExchange x) throws IOException {
        if (preflight(x)) return;
        if (!"POST".equalsIgnoreCase(x.getRequestMethod())) { json(x, 405, "{\"error\":\"method not allowed\"}"); return; }
        if (!authorizeProtected(x)) return;
        char[] pin = null;
        String fp = null;
        try {
            long contentLength = parseLong(x.getRequestHeaders().getFirst("Content-Length"));
            if (contentLength > MAX_PDF_BYTES + 1024L * 1024L) throw new IOException("Arquivo excede o limite de 25 MB.");
            Parts parts = Parts.parse(x, MAX_PDF_BYTES + 1024L * 1024L);
            fp = parts.fingerprint;
            if (parts.file == null || parts.file.length < 5 || !startsPdf(parts.file)) throw new IllegalArgumentException("PDF invalido ou nao recebido.");
            pin = isCloud() ? new char[0] : askPin("Confirme o PIN para assinar este PDF com seu certificado A3 ICP-Brasil.");
            if (!isCloud() && pin == null) throw new IllegalStateException("Assinatura cancelada.");
            KeyStore k = store(pin);
            String alias = findAlias(k, parts.fingerprint);
            if (alias == null) throw new GeneralSecurityException("Certificado selecionado nao encontrado.");
            PrivateKey key;
            try { key = (PrivateKey)k.getKey(alias, pin); } catch (Exception ex) { key = (PrivateKey)k.getKey(alias, null); }
            Certificate[] chain = k.getCertificateChain(alias);
            if (key == null || chain == null || chain.length == 0) throw new GeneralSecurityException("Chave privada ou cadeia do certificado indisponivel.");
            X509Certificate cert = (X509Certificate)chain[0];
            cert.checkValidity();
            if (!fingerprint(cert).equalsIgnoreCase(parts.fingerprint)) throw new GeneralSecurityException("Fingerprint do certificado nao confere.");

            byte[] signedPdf = signPdf(parts.file, key, chain, cert, parts.visibleSeal, parts.sealText);
            Validation validation = validateSignedPdf(signedPdf, parts.fingerprint);
            if (!validation.valid) throw new GeneralSecurityException("O PDF assinado falhou na validacao criptografica local: " + validation.details);

            x.getResponseHeaders().set("Content-Type", "application/pdf");
            x.getResponseHeaders().set("Content-Disposition", "attachment; filename=lexoffice-icpbr.pdf");
            x.getResponseHeaders().set("X-Lexoffice-Validation", "valid");
            x.getResponseHeaders().set("X-Lexoffice-Policy", validation.policyOid);
            x.getResponseHeaders().set("X-Lexoffice-Certificate-Fingerprint", validation.fingerprint);
            x.getResponseHeaders().set("X-Lexoffice-Bridge-Version", VERSION);
            cors(x);
            audit("SIGN", x.getRequestHeaders().getFirst("Origin"), parts.fingerprint, "OK", "in_sha256=" + sha256(parts.file) + ";out_sha256=" + sha256(signedPdf) + ";policy=" + validation.policyOid);
            x.sendResponseHeaders(200, signedPdf.length);
            OutputStream os = x.getResponseBody(); os.write(signedPdf); os.close();
        } catch (Exception e) {
            audit("SIGN", x.getRequestHeaders().getFirst("Origin"), fp, "ERROR", msg(e));
            json(x, 500, "{\"error\":\"" + esc(msg(e)) + "\"}");
        } finally { wipe(pin); }
    }

    static byte[] signPdf(byte[] input, final PrivateKey key, final Certificate[] chain, final X509Certificate cert, boolean seal, String sealText) throws Exception {
        PDDocument doc = PDDocument.load(input);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        SignatureOptions opts = new SignatureOptions();
        try {
            if (seal && doc.getNumberOfPages() > 0) addSeal(doc, cert, sealText);
            PDSignature sig = new PDSignature();
            sig.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            sig.setSubFilter(PDSignature.SUBFILTER_ETSI_CADES_DETACHED);
            sig.setName(cn(cert));
            sig.setReason("Assinatura digital ICP-Brasil - PAdES AD-RB 1.3");
            sig.setLocation("Brasil");
            sig.setSignDate(Calendar.getInstance());
            opts.setPreferredSignatureSize(SignatureOptions.DEFAULT_SIGNATURE_SIZE * 5);
            doc.addSignature(sig, new SignatureInterface() {
                public byte[] sign(InputStream content) throws IOException {
                    try {
                        PAdESSigner signer = new PAdESSigner(Policies.AD_RB_PADES_1_3);
                        signer.setProvider(signingProvider());
                        signer.setCertificates(chain);
                        signer.setPrivateKey(key);
                        return signer.doDetachedSign(all(content, MAX_PDF_BYTES + 1024L * 1024L));
                    } catch (Exception e) { throw new IOException("Falha ao gerar PAdES ICP-Brasil: " + msg(e), e); }
                }
            }, opts);
            doc.saveIncremental(out);
            return out.toByteArray();
        } finally { opts.close(); doc.close(); }
    }

    static Validation validateSignedPdf(byte[] pdf, String expectedFingerprint) throws Exception {
        PDDocument doc = PDDocument.load(pdf);
        try {
            List<PDSignature> signatures = doc.getSignatureDictionaries();
            if (signatures.isEmpty()) return new Validation(false, "", "", "nenhuma assinatura encontrada");
            PDSignature sig = signatures.get(signatures.size() - 1);
            byte[] signedContent = sig.getSignedContent(new ByteArrayInputStream(pdf));
            byte[] cmsBytes = sig.getContents(new ByteArrayInputStream(pdf));
            CMSSignedData cms = new CMSSignedData(new CMSProcessableByteArray(signedContent), cmsBytes);
            if (cms.getSignerInfos().getSigners().isEmpty()) return new Validation(false, "", "", "CMS sem assinante");
            SignerInformation si = cms.getSignerInfos().getSigners().iterator().next();
            Collection<X509CertificateHolder> matches = cms.getCertificates().getMatches(si.getSID());
            if (matches.isEmpty()) return new Validation(false, "", "", "certificado do assinante ausente");
            X509Certificate cert = new JcaX509CertificateConverter().setProvider("BC").getCertificate(matches.iterator().next());
            boolean crypto = si.verify(new JcaSimpleSignerInfoVerifierBuilder().setProvider("BC").build(cert));
            String fp = fingerprint(cert);
            String policy = extractPolicyOid(si);
            int[] br = sig.getByteRange();
            boolean coversFile = br != null && br.length == 4 && ((long)br[2] + (long)br[3] == pdf.length);
            boolean fpOk = expectedFingerprint == null || expectedFingerprint.isEmpty() || expectedFingerprint.equalsIgnoreCase(fp);
            boolean policyOk = POLICY_OID.equals(policy);
            boolean valid = crypto && coversFile && fpOk && policyOk;
            return new Validation(valid, fp, policy, "crypto=" + crypto + ";covers_file=" + coversFile + ";fingerprint=" + fpOk + ";policy=" + policyOk);
        } finally { doc.close(); }
    }

    static String extractPolicyOid(SignerInformation si) {
        try {
            if (si.getSignedAttributes() == null) return "";
            Attribute attr = si.getSignedAttributes().get(new ASN1ObjectIdentifier(SIG_POLICY_ATTR_OID));
            if (attr == null || attr.getAttrValues().size() == 0) return "";
            ASN1Sequence seq = ASN1Sequence.getInstance(attr.getAttrValues().getObjectAt(0));
            return ASN1ObjectIdentifier.getInstance(seq.getObjectAt(0)).getId();
        } catch (Exception e) { return ""; }
    }

    static void addSeal(PDDocument doc, X509Certificate cert, String custom) throws IOException {
        PDPage page = doc.getPage(doc.getNumberOfPages() - 1);
        PDPageContentStream cs = new PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true);
        try {
            float x = 42, y = 42;
            String header = custom == null || custom.trim().isEmpty() ? "ASSINADO DIGITALMENTE - ICP-BRASIL" : custom.trim();
            cs.setLineWidth(.8f); cs.addRect(x, y, 330, 58); cs.stroke();
            cs.beginText(); cs.setFont(PDType1Font.HELVETICA_BOLD, 9); cs.newLineAtOffset(x + 8, y + 42); cs.showText(safe(header));
            cs.setFont(PDType1Font.HELVETICA, 8); cs.newLineAtOffset(0, -13); cs.showText(safe("Signatario: " + cn(cert)));
            cs.newLineAtOffset(0, -11); cs.showText(safe("ICP-Brasil | " + new SimpleDateFormat("dd/MM/yyyy HH:mm:ss").format(new Date()))); cs.endText();
        } finally { cs.close(); }
    }

    static char[] askPin(final String text) throws Exception {
        final JPasswordField field = new JPasswordField(18);
        final int[] result = new int[1];
        SwingUtilities.invokeAndWait(() -> result[0] = JOptionPane.showConfirmDialog(null, new Object[]{text, "O PIN permanece somente neste computador e nunca e enviado ao navegador, LEXOFFICE ou Supabase.", field}, "LEXOFFICE - ICP-Brasil", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE));
        return result[0] == JOptionPane.OK_OPTION ? field.getPassword() : null;
    }

    static String findAlias(KeyStore k, String fp) throws Exception {
        Enumeration<String> en = k.aliases();
        while (en.hasMoreElements()) {
            String a = en.nextElement(); Certificate c = k.getCertificate(a);
            if (c instanceof X509Certificate && k.isKeyEntry(a) && (fp == null || fp.isEmpty() || fingerprint((X509Certificate)c).equalsIgnoreCase(fp))) return a;
        }
        return null;
    }

    static void audit(String action, String origin, String fingerprint, String status, String detail) {
        try {
            String base = System.getenv("LOCALAPPDATA"); if (base == null || base.trim().isEmpty()) base = System.getProperty("user.home");
            Path dir = Paths.get(base, "LEXOFFICE"); Files.createDirectories(dir);
            Path log = dir.resolve("icpbr-bridge-audit.log");
            String line = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ").format(new Date()) + "\t" + action + "\t" + status + "\torigin=" + safeLog(origin) + "\tfingerprint=" + safeLog(fingerprint) + "\t" + safeLog(detail) + System.lineSeparator();
            Files.write(log, line.getBytes(StandardCharsets.UTF_8), java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
        } catch (Exception ignored) { }
    }

    static String safeLog(String s) { return s == null ? "-" : s.replace('\n',' ').replace('\r',' ').replace('\t',' '); }
    static boolean startsPdf(byte[] b) { return b.length >= 5 && b[0]=='%' && b[1]=='P' && b[2]=='D' && b[3]=='F' && b[4]=='-'; }
    static String fingerprint(X509Certificate c) throws Exception { return hex(MessageDigest.getInstance("SHA-256").digest(c.getEncoded())); }
    static String sha256(byte[] b) throws Exception { return hex(MessageDigest.getInstance("SHA-256").digest(b)); }
    static String cn(X509Certificate c) { return dn(c.getSubjectX500Principal().getName()); }
    static String dn(String s) { for (String p : s.split(",")) if (p.trim().startsWith("CN=")) return p.trim().substring(3); return s; }
    static void wipe(char[] c) { if (c != null) Arrays.fill(c, '\0'); }
    static long parseLong(String v) { try { return v == null ? -1L : Long.parseLong(v); } catch (Exception e) { return -1L; } }

    static void json(HttpExchange x, int code, String body) throws IOException {
        cors(x); byte[] data = body.getBytes(StandardCharsets.UTF_8); x.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8"); x.sendResponseHeaders(code, data.length); OutputStream o = x.getResponseBody(); o.write(data); o.close();
    }
    static String msg(Throwable e) { Throwable t=e; while (t.getCause()!=null) t=t.getCause(); return t.getMessage()!=null?t.getMessage():e.getClass().getSimpleName(); }
    static String esc(String s) { return s==null?"":s.replace("\\","\\\\").replace("\"","\\\"").replace("\n"," ").replace("\r"," "); }
    static String safe(String s) { return s==null?"":s.replace('\u2014','-').replace('\u2022','-').replaceAll("[^\\x20-\\x7E\\u00C0-\\u00FF]"," "); }
    static String hex(byte[] b) { StringBuilder s=new StringBuilder(); for(byte v:b)s.append(String.format("%02X",v)); return s.toString(); }
    static String join(List<String> a) { StringBuilder s=new StringBuilder(); for(int i=0;i<a.size();i++){if(i>0)s.append(',');s.append(a.get(i));} return s.toString(); }

    static byte[] all(InputStream in, long limit) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buf = new byte[8192]; long total=0; int n;
        while((n=in.read(buf))!=-1){ total+=n; if(total>limit) throw new IOException("Conteudo excede o limite permitido."); out.write(buf,0,n); } return out.toByteArray();
    }

    static final class Validation {
        final boolean valid; final String fingerprint; final String policyOid; final String details;
        Validation(boolean v,String f,String p,String d){valid=v;fingerprint=f;policyOid=p;details=d;}
    }

    static final class Parts {
        byte[] file; String fingerprint; String sealText; boolean visibleSeal=true;
        static Parts parse(HttpExchange x, long max) throws IOException {
            String ct=x.getRequestHeaders().getFirst("Content-Type"); if(ct==null||!ct.contains("boundary=")) throw new IOException("multipart/form-data invalido");
            String boundary=ct.substring(ct.indexOf("boundary=")+9).replace("\"","").trim(); byte[] raw=all(x.getRequestBody(),max); String text=new String(raw,StandardCharsets.ISO_8859_1), marker="--"+boundary; Parts out=new Parts(); int pos=0;
            while((pos=text.indexOf(marker,pos))>=0){ int hs=text.indexOf("\r\n\r\n",pos); if(hs<0)break; int start=hs+4,end=text.indexOf("\r\n"+marker,start); if(end<0)break; String h=text.substring(pos,hs),name=attr(h,"name"); byte[] data=Arrays.copyOfRange(raw,start,end);
                if("file".equals(name))out.file=data; else { String v=new String(data,StandardCharsets.UTF_8).trim(); if("certificateFingerprint".equals(name))out.fingerprint=v; else if("visibleSeal".equals(name))out.visibleSeal=Boolean.parseBoolean(v); else if("sealText".equals(name))out.sealText=v; } pos=end+2; }
            return out;
        }
        static String attr(String h,String n){String q=n+"=\"";int a=h.indexOf(q);if(a<0)return null;int b=h.indexOf('"',a+q.length());return b<0?null:h.substring(a+q.length(),b);}
    }
}
