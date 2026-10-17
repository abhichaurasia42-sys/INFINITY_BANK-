# INFINITY_BANK-

## Project Overview

INFINITY_BANK- is a static web application that simulates a bank’s online portal. It provides a collection of HTML pages and associated CSS/JS assets for common banking features such as:

- **Send Money**
- **Bill Payments**
- **Recharge / Mobile Top‑up**
- **Check Balance**
- **Card Management**
- **Loan Services**
- **Transaction History**
- **User Authentication (Login / Forgot Password)**
- **Profile & Settings**

The UI has been updated to use a dark‑navy + gold colour palette with improved contrast for better accessibility.

## Demo
Open `index.html` (or any of the feature pages) in a web browser. All assets are served statically – no backend server is required for the UI.

## Repository Structure

```
BMS/
├─ public/               # All public assets (HTML, CSS, images, JS)
│   ├─ nav/               # Navigation‑related pages
│   ├─ styles_*.css       # Individual style sheets for each feature
│   ├─ index.html
│   └─ ...                # Other HTML pages
├─ server.js             # Simple Node/Express server (optional)
├─ package.json          # Project metadata & dependencies
└─ README.md             # This file
```

## Setup

1. **Clone the repository** (once it is pushed):
   ```bash
   git clone https://github.com/abhichaurasia42-sys/INFINITY_BANK-.git
   cd INFINITY_BANK-
   ```
2. **Open the UI**
   - Open `public/index.html` in a browser, or
   - Run a local static server (e.g., `npx serve public` if you have Node.js installed) to serve the files over HTTP.

## Development

- **Style updates** – All CSS files in `public/` keep the original class/ID names. The colour palette, border‑radius, and shadows have been unified across pages.
- **Adding new pages** – Copy an existing HTML file, adjust the navigation links, and create a corresponding `styles_*.css` file if needed.
- **Version control** – All changes are tracked with Git. Use standard Git workflow:
  ```bash
  git add <file>
  git commit -m "Your message"
  git push
  ```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug‑fix.
3. Make your changes and ensure the UI remains accessible (check colour contrast).
4. Submit a pull request with a clear description of the changes.

## License

*Add your preferred license here (e.g., MIT, Apache 2.0).*
