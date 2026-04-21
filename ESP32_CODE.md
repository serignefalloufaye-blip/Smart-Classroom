# Code ESP32 (Firebase Realtime Database)

Voici votre code C++ (Arduino/PlatformIO) corrigé et adapté pour fonctionner **parfaitement** avec le tableau de bord web du "Smart Classroom Control System".

### Problèmes corrigés par rapport à votre code original :
1. **Conflit de broches (Pin) :** Vous aviez défini `pinPIR = 35` et `pinLight = 35`. La lumière a été déplacée sur le GPIO `32`.
2. **DHT11 :** Il manquait la librairie `#include <DHT.h>` et le `#define DHTPIN` ne devait pas avoir de guillemets (`34` au lieu de `"34"`).
3. **URL Firebase :** `DATABASE_URL` doit pointer vers le serveur RTDB exact (qui se termine par `.firebasedatabase.app`), et non vers le Firebase Hosting (`.firebaseapp.com`).
4. **Nomenclature Web :** L'interface web utilise les constantes `"MANUAL_WEB"`, `"MANUAL_LOCAL"`, et `"AUTO"`. Les états des relais nécessitent des textes `"ON"` ou `"OFF"` et non de simples booléens. L'arborescence utilisée depuis l'interface a aussi été assignée (ex: `/system/...` et `/sensors/...`).

### Le Code (main.ino) :

```cpp
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <DHT.h> // <--- Ajouté

// --- CONFIGURATION ---
#define WIFI_SSID "Konnectel"
#define WIFI_PASSWORD ""
#define API_KEY "AIzaSyDDzHu5unFv_QWXqzwOXnLHvkcQdXmkO48"
// CORRECTION : Utilisation de l'URL correcte du noeud RTDB
#define DATABASE_URL "https://smarthealth-a4d7a-default-rtdb.europe-west1.firebasedatabase.app/"

// --- CONFIG DHT11 ---
#define DHTPIN 34 // <--- Sans guillemets
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// --- AUTRES BROCHES ---
const int pinPIR     = 35;
const int pinBtnEnt  = 14;
const int pinBtnExt  = 27;
const int pinBtnMode = 26;
const int pinLight   = 32; // <--- Changé pour éviter le conflit avec le PIR (35)
const int pinFan     = 33;

// --- VARIABLES ---
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long prevMillis = 0;
int peopleCount = 0;
float temperature = 0.0;
float humidity = 0.0; 
String currentMode = "AUTO"; 
bool lightState = false, fanState = false, motionDetected = false;
bool lastEnt = HIGH, lastExt = HIGH, lastMode = HIGH;

void setup() {
  Serial.begin(115200);
  dht.begin();

  pinMode(pinPIR, INPUT);
  pinMode(pinBtnEnt, INPUT_PULLUP);
  pinMode(pinBtnExt, INPUT_PULLUP);
  pinMode(pinBtnMode, INPUT_PULLUP);
  pinMode(pinLight, OUTPUT);
  pinMode(pinFan, OUTPUT);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK");

  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  Firebase.signUp(&config, &auth, "", "");
  config.token_status_callback = tokenStatusCallback;
  
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  lectureCapteurs();
  
  if (Firebase.ready() && (millis() - prevMillis > 2000)) {
    prevMillis = millis();
    
    // 1. Synchro Mode depuis Firebase
    if (Firebase.RTDB.getString(&fbdo, "/system/mode")) {
      currentMode = fbdo.stringData();
    }

    // 2. Réception des commandes Web si on est en MANUAL_WEB
    if (currentMode == "MANUAL_WEB") {
      if (Firebase.RTDB.getString(&fbdo, "/system/light")) {
        lightState = (fbdo.stringData() == "ON");
      }
      if (Firebase.RTDB.getString(&fbdo, "/system/fan")) {
        fanState = (fbdo.stringData() == "ON");
      }
    }

    // 3. Logique d'Autonomie (AUTO)
    if (currentMode == "AUTO") {
      lightState = (peopleCount > 0 || motionDetected);
      fanState = (temperature > 26.0);
      
      // On envoie nos décisions au dashboard web
      Firebase.RTDB.setString(&fbdo, "/system/light", lightState ? "ON" : "OFF");
      Firebase.RTDB.setString(&fbdo, "/system/fan", fanState ? "ON" : "OFF");
    }

    // 4. Envoi de la télémétrie des capteurs
    Firebase.RTDB.setFloat(&fbdo, "/sensors/temperature", temperature);
    Firebase.RTDB.setFloat(&fbdo, "/sensors/humidity", humidity);
    Firebase.RTDB.setInt(&fbdo, "/sensors/people", peopleCount);
    Firebase.RTDB.setBool(&fbdo, "/sensors/motion", motionDetected);
    
    // 5. Maintien du statut en ligne
    Firebase.RTDB.setString(&fbdo, "/system/status", "ONLINE");
  }

  // Application de l'état matériel
  digitalWrite(pinLight, lightState ? HIGH : LOW);
  digitalWrite(pinFan, fanState ? HIGH : LOW);
}

void lectureCapteurs() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  
  if (!isnan(t) && !isnan(h)) {
    temperature = t;
    humidity = h;
  }

  motionDetected = digitalRead(pinPIR);

  bool ent = digitalRead(pinBtnEnt), ext = digitalRead(pinBtnExt), mod = digitalRead(pinBtnMode);
  if (ent == LOW && lastEnt == HIGH) { peopleCount++; delay(150); }
  if (ext == LOW && lastExt == HIGH && peopleCount > 0) { peopleCount--; delay(150); }
  
  if (mod == LOW && lastMode == HIGH) {
    // Cycles de modes compatibles avec le Dashboard Web !
    if(currentMode == "AUTO") currentMode = "MANUAL_LOCAL";
    else if(currentMode == "MANUAL_LOCAL") currentMode = "MANUAL_WEB";
    else currentMode = "AUTO";

    Firebase.RTDB.setString(&fbdo, "/system/mode", currentMode);
    delay(150);
  }
  
  lastEnt = ent; lastExt = ext; lastMode = mod;
}
```
