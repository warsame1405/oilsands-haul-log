import React, { useState } from "react";

export default function ExpensesTab() {
  const [darkMode, setDarkMode] = useState(false);

  const styles = {
    page: {
      background: darkMode ? "#0B0F1A" : "#F5F5F5",
      minHeight: "100vh",
      padding: "16px",
      fontFamily: "sans-serif"
    },
    header: {
      background: darkMode
        ? "linear-gradient(135deg, #0B0F1A, #121826)"
        : "#FFFFFF",
      color: darkMode ? "#FFFFFF" : "#000",
      padding: "16px",
      borderRadius: "12px",
      marginBottom: "16px",
      fontWeight: "700"
    },
    card: {
      background: "linear-gradient(135deg, #E8962E, #F0A93E)",
      color: "#000",
      borderRadius: "20px",
      padding: "20px",
      marginBottom: "16px"
    },
    button: {
      background: darkMode
        ? "linear-gradient(135deg, #E8962E, #F0A93E)"
        : "#1C2B4A",
      color: "#FFF",
      fontWeight: "700",
      borderRadius: "14px",
      padding: "14px",
      width: "100%",
      marginBottom: "16px",
      border: "none"
    },
    item: {
      background: darkMode ? "rgba(255,255,255,0.05)" : "#FFFFFF",
      color: darkMode ? "#FFF" : "#000",
      borderRadius: "16px",
      padding: "16px",
      marginBottom: "10px"
    },
    amount: {
      color: "#E8962E",
      fontWeight: "700"
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        TRUCKPILOT
        <button
          onClick={() => setDarkMode(!darkMode)}
          style={{ float: "right" }}
        >
          Toggle
        </button>
      </div>

      <h2 style={{ color: darkMode ? "#FFF" : "#000" }}>Expenses</h2>

      <div style={styles.card}>
        <div>TOTAL EXPENSES — MARCH</div>
        <h1>$1,240</h1>
        <div>12 transactions this month</div>
      </div>

      <button style={styles.button}>+ ADD EXPENSE</button>

      <div style={styles.item}>
        Fuel & Oil — <span style={styles.amount}>$680</span>
      </div>
      <div style={styles.item}>
        Maintenance — <span style={styles.amount}>$310</span>
      </div>
      <div style={styles.item}>
        Insurance — <span style={styles.amount}>$250</span>
      </div>
      <div style={styles.item}>
        Permits — <span style={styles.amount}>$0</span>
      </div>
      <div style={styles.item}>
        Tolls — <span style={styles.amount}>$0</span>
      </div>
      <div style={styles.item}>
        Meals — <span style={styles.amount}>$0</span>
      </div>
    </div>
  );
}
