import java.util.ArrayList;
import java.util.List;

// --- 1. Observer Interface ---
interface TeamMember {
    void onTaskStatusChanged(String taskName, String newStatus);
}

// --- 2. Subject (Task) ---
class Task {
    private String name;
    private String status;
    private List<TeamMember> members = new ArrayList<>();

    public Task(String name) {
        this.name = name;
        this.status = "To Do";
    }

    public void addMember(TeamMember m) {
        members.add(m);
    }

    public void removeMember(TeamMember m) {
        members.remove(m);
    }

    // Automation: Notify immediately when status changes
    public void setStatus(String newStatus) {
        this.status = newStatus;
        System.out.println("\n--- [Project] Task '" + name + "' changed to: " + status + " ---");
        notifyAllMembers();
    }

    private void notifyAllMembers() {
        for (TeamMember m : members) {
            m.onTaskStatusChanged(name, status);
        }
    }
}

// --- 3. Concrete Observers (Different Roles) ---
class Developer implements TeamMember {
    private String name;
    public Developer(String name) { this.name = name; }

    @Override
    public void onTaskStatusChanged(String taskName, String newStatus) {
        if (newStatus.equals("Bug")) {
            System.out.println("   -> Dev " + name + ": Notification received. Opening code to fix.");
        } else {
            System.out.println("   -> Dev " + name + ": Status updated.");
        }
    }
}

class Tester implements TeamMember {
    private String name;
    public Tester(String name) { this.name = name; }

    @Override
    public void onTaskStatusChanged(String taskName, String newStatus) {
        if (newStatus.equals("Done")) {
            System.out.println("   -> Tester " + name + ": Notification received. Starting to test this task.");
        }
    }
}

// --- Main Execution ---
public class ProjectDemo {
    public static void main(String[] args) {
        Task loginTask = new Task("Login Function");

        Developer dev = new Developer("David");
        Tester tester = new Tester("Sarah");

        // Loose Coupling: Task doesn't care if it's a Dev or Tester, only knows they are TeamMembers
        loginTask.addMember(dev);
        loginTask.addMember(tester);

        // Scenario
        loginTask.setStatus("Doing");
        loginTask.setStatus("Done"); // Tester will react
        loginTask.setStatus("Bug");  // Dev will react
    }
}