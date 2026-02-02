import java.util.ArrayList;
import java.util.List;

// --- 1. Observer Interface ---
interface Investor {
    void update(String stockSymbol, double price);
}

// --- 2. Subject (Stock) ---
class Stock {
    private String symbol;
    private double price;
    // List of investors monitoring the stock (One-to-Many)
    private List<Investor> investors = new ArrayList<>();

    public Stock(String symbol, double price) {
        this.symbol = symbol;
        this.price = price;
    }

    // Register observer (Attach)
    public void attach(Investor investor) {
        investors.add(investor);
    }

    // Unregister observer (Detach)
    public void detach(Investor investor) {
        investors.remove(investor);
    }

    // Automatic notification mechanism (Notify)
    public void notifyInvestors() {
        for (Investor investor : investors) {
            investor.update(symbol, price);
        }
    }

    // When price changes -> Call notify immediately (Real-time)
    public void setPrice(double newPrice) {
        this.price = newPrice;
        System.out.println("\n--- [Market] Price of " + symbol + " changed to: " + price + " ---");
        notifyInvestors();
    }
}

// --- 3. Concrete Observer ---
class SimpleInvestor implements Investor {
    private String name;

    public SimpleInvestor(String name) {
        this.name = name;
    }

    @Override
    public void update(String stockSymbol, double price) {
        System.out.println("   -> Investor " + name + " received alert: " + stockSymbol + " new price is " + price);
        
        // Custom logic: E.g., if price < 50, then buy
        if (price < 50.0) {
            System.out.println("      (ALARM: " + name + " is placing a BUY order!)");
        }
    }
}

// --- Main class for testing ---
public class StockDemo {
    public static void main(String[] args) {
        Stock appleStock = new Stock("AAPL", 100.0);

        SimpleInvestor iv1 = new SimpleInvestor("Mr. John");
        SimpleInvestor iv2 = new SimpleInvestor("Ms. Sarah");

        appleStock.attach(iv1);
        appleStock.attach(iv2);

        // Change price -> Automatically trigger notifications
        appleStock.setPrice(105.0);
        appleStock.setPrice(49.0); // Low price, triggers buy logic for the investors
    }
}