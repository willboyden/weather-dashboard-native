# Weather Dashboard - React Native (Expo)

A cross-platform weather dashboard built with React Native and Expo that runs on **Web, iOS, and Android** from a single codebase.

## Features

- ✅ Real-time weather data from Open-Meteo API
- ✅ 219 cities worldwide (all major US cities + MLB team cities)
- ✅ Interactive maps with React Native Maps
- ✅ Beautiful charts with React Native Chart Kit
- ✅ Dark mode support
- ✅ Metric/Imperial unit conversion
- ✅ City search and filtering
- ✅ Multiple weather variables (temperature, humidity, wind, precipitation, etc.)
- ✅ Responsive design for all screen sizes
- ✅ Works offline with cached data

## Prerequisites

- Node.js 16+
- npm or yarn
- For iOS: Xcode (Mac only)
- For Android: Android Studio
- Expo Go app (for testing on physical devices)

## Installation

```bash
cd weather-dashboard-native
npm install
```

## Running the App

### Web
```bash
npm run web
```
Opens in browser at http://localhost:8081

### iOS (Mac only)
```bash
npm run ios
```
Opens in iOS Simulator

### Android
```bash
npm run android
```
Opens in Android Emulator

### On Physical Device
1. Install Expo Go from App Store/Play Store
2. Run `npm start`
3. Scan QR code with Expo Go (Android) or Camera app (iOS)

## Project Structure

```
weather-dashboard-native/
├── App.js                 # Main app component
├── assets/
│   └── data/
│       └── cities.json    # 219 cities database
├── app.json               # Expo configuration
└── package.json           # Dependencies
```

## Building for Production

### Android APK
```bash
npx expo build:android
```

### iOS IPA
```bash
npx expo build:ios
```

### Web Build
```bash
npx expo export:web
```

## Configuration

### Google Maps API Keys (Optional)
For better map performance, add Google Maps API keys in `app.json`:

```json
{
  "ios": {
    "config": {
      "googleMapsApiKey": "YOUR_IOS_API_KEY"
    }
  },
  "android": {
    "config": {
      "googleMaps": {
        "apiKey": "YOUR_ANDROID_API_KEY"
      }
    }
  }
}
```

## Key Dependencies

- **expo** - Universal React Native framework
- **react-native-maps** - Interactive maps for iOS/Android
- **react-native-chart-kit** - Beautiful charts
- **expo-location** - Geolocation services
- **@react-native-async-storage/async-storage** - Local data storage

## Comparison with Web App

### Original Web App (Create React App)
- ✅ Web only
- ✅ Uses react-leaflet for maps
- ✅ Uses Chart.js for charts
- ✅ Uses Tailwind CSS for styling
- ✅ Full feature set with comparison, export, PWA

### Native App (Expo)
- ✅ Web, iOS, and Android
- ✅ Uses react-native-maps
- ✅ Uses react-native-chart-kit
- ✅ Uses StyleSheet for styling
- ✅ Core features (weather data, charts, maps, search)

## Features Not Yet Ported

Due to the complexity of the conversion, some advanced features are not yet implemented:

- ⏳ City comparison
- ⏳ Data export (CSV/JSON)
- ⏳ Weather alerts
- ⏳ Air Quality Index
- ⏳ Social sharing
- ⏳ Favorites system
- ⏳ Historical data

These can be added incrementally using React Native equivalents.

## Development Tips

1. **Hot Reload**: Changes auto-reload in Expo
2. **Debugging**: Shake device or press `Cmd+D` (iOS) / `Cmd+M` (Android)
3. **Web Testing**: Use browser DevTools
4. **Performance**: Use React DevTools Profiler

## Troubleshooting

### Maps not showing
- Ensure you have internet connection
- Check Google Maps API keys are configured
- On iOS simulator, reset location: Features → Location → Custom Location

### Build errors
```bash
rm -rf node_modules
npm install
npx expo start --clear
```

### Metro bundler issues
```bash
npx expo start --clear
```

## License

Same as original web app.

## Credits

Ported from the original Create React App weather dashboard with full Expo conversion for cross-platform support.
