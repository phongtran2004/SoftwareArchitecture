// --- 1. Target Interface (Client expects to use this) ---
interface IJsonService {
    String getJsonData();
}

// --- 2. Adaptee (Legacy System - Only returns XML) ---
class LegacyXmlSystem {
    public String getXmlData() {
        return "<user><id>1</id><name>John Doe</name></user>";
    }
}

// --- 3. Adapter (The Bridge/Converter) ---
class XmlToJsonAdapter implements IJsonService {
    private LegacyXmlSystem legacySystem;

    // Constructor accepts the legacy system (Dependency Injection)
    public XmlToJsonAdapter(LegacyXmlSystem legacySystem) {
        this.legacySystem = legacySystem;
    }

    @Override
    public String getJsonData() {
        // Step 1: Get XML data from Adaptee
        String xml = legacySystem.getXmlData();
        
        // Step 2: Convert (Single responsibility logic here)
        String json = convertXmlToJson(xml);
        
        // Step 3: Return the result expected by the Client
        return json;
    }

    // Mock method for conversion logic
    private String convertXmlToJson(String xml) {
        System.out.println("[Adapter] Converting XML: '" + xml + "' to JSON...");
        // Real code would use a parsing library; here we mock the string
        return "{ \"id\": 1, \"name\": \"John Doe\" }";
    }
}

// --- 4. Client (Web Service) ---
class WebService {
    public void processRequest(IJsonService service) {
        // Client only knows how to work with the JSON Interface
        String data = service.getJsonData();
        System.out.println("[Web Service] Successfully processed data: " + data);
    }
}

// --- Main Execution ---
public class AdapterDemo {
    public static void main(String[] args) {
        // Existing legacy system
        LegacyXmlSystem oldSystem = new LegacyXmlSystem();

        // Plug the Adapter into the legacy system
        IJsonService adapter = new XmlToJsonAdapter(oldSystem);

        // Web Service runs smoothly even though the data source is XML
        WebService client = new WebService();
        client.processRequest(adapter);
    }
}