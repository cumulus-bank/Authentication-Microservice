import express = require("express");
import logger = require("morgan");
import bodyParser = require("body-parser");
const passwordhash = require("password-hash");
const jwt = require("jsonwebtoken");
const passportJWT = require("passport-jwt");
import passport = require("passport");

const mysql = require("mysql2/promise");

class App {
  public jwtOptions: any = {};
  public ExtractJwt = passportJWT.ExtractJwt;
  public express: express.Application;
  public pool: any;

  constructor() {
    this.jwtOptions.jwtFromRequest = this.ExtractJwt.fromAuthHeaderAsBearerToken();
    this.jwtOptions.secretOrKey = process.env.JWT_SECRET || "cumulus-secret";

    this.pool = mysql.createPool({
      host: process.env.MARIADB_HOST || "mariadb-vm",
      port: parseInt(process.env.MARIADB_PORT || "3306"),
      user: process.env.MARIADB_USER || "cumulus",
      password: process.env.MARIADB_PASSWORD || "cumulus123",
      database: process.env.MARIADB_DATABASE || "cumulus",
      waitForConnections: true,
      connectionLimit: 10,
    });

    console.log(`MariaDB connection configured: ${process.env.MARIADB_HOST || "mariadb-vm"}:${process.env.MARIADB_PORT || "3306"}`);

    this.express = express();
    this.middleware();
    this.routes();
    this.initDatabase();
  }

  private async initDatabase(): Promise<void> {
    try {
      const conn = await this.pool.getConnection();
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS UserData (
          ID INT AUTO_INCREMENT PRIMARY KEY,
          LastName VARCHAR(255),
          FirstName VARCHAR(255),
          Email VARCHAR(255) UNIQUE,
          Password VARCHAR(255),
          Age INT,
          Mobile VARCHAR(50)
        )
      `);
      conn.release();
      console.log("Database table initialized");
    } catch (err) {
      console.error("Database init error (will retry on first request):", err.message);
    }
  }

  private middleware(): void {
    this.express.use(function (req, res, next) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "X-Requested-With,content-type,Authorization");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
      if (req.method === "OPTIONS") {
        return res.sendStatus(200);
      }
      next();
    });
    this.express.use(logger("dev"));
    this.express.use(bodyParser.json());
    this.express.use(passport.initialize());
    this.express.use(bodyParser.urlencoded({ extended: false }));
  }

  private routes(): void {
    let router = express.Router();

    router.post("/login", async (req, res) => {
      try {
        const [rows] = await this.pool.execute(
          "SELECT * FROM UserData WHERE Email = ?",
          [req.body.email]
        );
        if (!rows || rows.length === 0) {
          return res.status(401).json({ message: "Please signup, no email exists" });
        }
        const user = rows[0];
        if (passwordhash.verify(req.body.password, user.Password)) {
          const data = { ...user };
          delete data.Password;
          res.json({
            sucessful: true,
            token: jwt.sign({ data }, process.env.JWT_SECRET || "cumulus-secret"),
          });
        } else {
          res.status(401).json({ message: "Password/Email did not match" });
        }
      } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Server error" });
      }
    });

    router.post("/createUser", async (req, res) => {
      try {
        await this.pool.execute(
          "INSERT INTO UserData (LastName, FirstName, Email, Password, Age, Mobile) VALUES (?, ?, ?, ?, ?, ?)",
          [
            req.body.lastName,
            req.body.firstName,
            req.body.email,
            passwordhash.generate(req.body.password),
            req.body.age,
            req.body.mobile,
          ]
        );
        res.json({ message: "sucessful" });
      } catch (err) {
        console.error("Create user error:", err);
        res.status(500).json({ err: err.message });
      }
    });

    router.get("/healthz", (req, res) => {
      res.send("success");
    });

    this.express.use("/", router);
  }
}

export default new App().express;
