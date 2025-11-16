import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Dimensions,
  ActivityIndicator,
  SafeAreaView,
  Alert,
  Share
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LineChart, BarChart } from 'react-native-chart-kit';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Import cities data
import citiesData from './assets/data/cities.json';

const API_URL = 'https://api.open-meteo.com/v1/forecast';

const VARIABLE_OPTIONS = [
  { key: 'temperature_2m', label: 'Temperature', isTemp: true, color: '#FF6384' },
  { key: 'relativehumidity_2m', label: 'Humidity (%)', color: '#36A2EB' },
  { key: 'apparent_temperature', label: 'Feels Like', isTemp: true, color: '#FF9F40' },
  { key: 'windspeed_10m', label: 'Wind Speed', isSpeed: true, color: '#4BC0C0' },
  { key: 'precipitation_probability', label: 'Rain Chance (%)', color: '#66CCFF' },
];

const TIME_RANGES = [
  { label: '1 Day', value: 24 },
  { label: '2 Days', value: 48 },
  { label: '3 Days', value: 72 },
  { label: '7 Days', value: 168 },
];

export default function App() {
  const [cities] = useState(citiesData.sort((a, b) => a.name.localeCompare(b.name)));
  const [selectedCity, setSelectedCity] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState(24);
  const [selectedVariables, setSelectedVariables] = useState(['temperature_2m', 'relativehumidity_2m']);
  const [isMetric, setIsMetric] = useState(true);
  const [chartType, setChartType] = useState('line');
  const [showMap, setShowMap] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDark, setIsDark] = useState(false);

  // New features state
  const [favorites, setFavorites] = useState([]);
  const [comparisonCities, setComparisonCities] = useState([]);
  const [comparisonData, setComparisonData] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [aqiData, setAqiData] = useState(null);
  const [weatherAlerts, setWeatherAlerts] = useState([]);

  // Load favorites from AsyncStorage
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const stored = await AsyncStorage.getItem('favorites');
        if (stored) {
          setFavorites(JSON.parse(stored));
        }
      } catch (err) {
        console.error('Failed to load favorites:', err);
      }
    };
    loadFavorites();
  }, []);

  // Save favorites to AsyncStorage
  useEffect(() => {
    const saveFavorites = async () => {
      try {
        await AsyncStorage.setItem('favorites', JSON.stringify(favorites));
      } catch (err) {
        console.error('Failed to save favorites:', err);
      }
    };
    if (favorites.length > 0) {
      saveFavorites();
    }
  }, [favorites]);

  // Initialize with first city
  useEffect(() => {
    if (cities.length > 0 && !selectedCity) {
      setSelectedCity(cities[0]);
    }
  }, [cities]);

  // Fetch weather data
  useEffect(() => {
    if (!selectedCity) return;

    const fetchWeather = async () => {
      let loadingTimeout = setTimeout(() => setLoading(true), 200);
      setError(null);

      try {
        const vars = VARIABLE_OPTIONS.map(v => v.key).join(',');
        const url = `${API_URL}?latitude=${selectedCity.lat}&longitude=${selectedCity.lon}&hourly=${vars}&timezone=auto&current_weather=true`;
        const response = await fetch(url);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const slicedHourly = {};
        VARIABLE_OPTIONS.forEach(opt => {
          if (data.hourly[opt.key]) {
            slicedHourly[opt.key] = data.hourly[opt.key].slice(0, timeRange);
          }
        });

        setWeatherData({
          hourly: slicedHourly,
          time: data.hourly.time.slice(0, timeRange),
          current: data.current_weather
        });

        // Fetch Air Quality data
        try {
          const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${selectedCity.lat}&longitude=${selectedCity.lon}&current=european_aqi,us_aqi&hourly=pm10,pm2_5`;
          const aqiRes = await fetch(aqiUrl);
          if (aqiRes.ok) {
            const aqiJson = await aqiRes.json();
            setAqiData(aqiJson);
          }
        } catch (e) {
          console.warn('Failed to fetch AQI data:', e);
        }

        // Generate weather alerts
        const alerts = [];
        const temp = data.current_weather?.temperature;
        const windSpeed = data.current_weather?.windspeed;

        if (temp && temp > 35) {
          alerts.push({ type: 'heat', message: 'Extreme heat warning', severity: 'high' });
        } else if (temp && temp < -10) {
          alerts.push({ type: 'cold', message: 'Extreme cold warning', severity: 'high' });
        }

        if (windSpeed && windSpeed > 60) {
          alerts.push({ type: 'wind', message: 'High wind warning', severity: 'moderate' });
        }

        setWeatherAlerts(alerts);

      } catch (err) {
        setError(err.toString());
      } finally {
        clearTimeout(loadingTimeout);
        setLoading(false);
      }
    };

    fetchWeather();
  }, [selectedCity, timeRange]);

  // Fetch comparison cities data - update when timeRange or selectedVariables change
  useEffect(() => {
    if (!showComparison || comparisonCities.length === 0) {
      setComparisonData([]);
      return;
    }

    const fetchComparisonData = async () => {
      try {
        const promises = comparisonCities.map(async (compCity) => {
          const vars = VARIABLE_OPTIONS.map(v => v.key).join(',');
          const url = `${API_URL}?latitude=${compCity.lat}&longitude=${compCity.lon}&hourly=${vars}&timezone=auto&current_weather=true`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to fetch data for ${compCity.name}`);
          const json = await res.json();

          return {
            city: compCity,
            current: json.current_weather,
            hourly: json.hourly
          };
        });

        const results = await Promise.all(promises);
        setComparisonData(results);
      } catch (err) {
        console.error('Failed to fetch comparison data:', err);
      }
    };

    fetchComparisonData();
  }, [comparisonCities, showComparison, timeRange, selectedVariables]);

  // Temperature conversion
  const convertTemp = (temp) => {
    if (!isMetric) return (temp * 9/5) + 32;
    return temp;
  };

  // Speed conversion
  const convertSpeed = (speed) => {
    if (!isMetric) return speed * 0.621371;
    return speed;
  };

  // Format temperature
  const formatTemp = (temp) => {
    const converted = convertTemp(temp);
    return `${Math.round(converted)}°${isMetric ? 'C' : 'F'}`;
  };

  // Format speed
  const formatSpeed = (speed) => {
    const converted = convertSpeed(speed);
    return `${Math.round(converted)} ${isMetric ? 'km/h' : 'mph'}`;
  };

  // Prepare chart data with dynamic labels based on time range
  const getChartData = () => {
    if (!weatherData) return null;

    // Format labels based on time range
    const labels = weatherData.time.map((t, index) => {
      const date = new Date(t);

      if (timeRange <= 24) {
        // For 24 hours or less, show just time
        return `${date.getHours().toString().padStart(2, '0')}:00`;
      } else if (timeRange <= 72) {
        // For 2-3 days, show day + time
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `${days[date.getDay()]} ${date.getHours()}h`;
      } else if (timeRange <= 168) {
        // For up to a week, show date + time (but only every few hours to reduce clutter)
        if (index % 3 === 0) {
          return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}h`;
        }
        return '';
      } else {
        // For multi-week, show date only (sample every 6 hours)
        if (index % 6 === 0) {
          return `${date.getMonth() + 1}/${date.getDate()}`;
        }
        return '';
      }
    });

    const datasets = selectedVariables.map(varKey => {
      const varOption = VARIABLE_OPTIONS.find(opt => opt.key === varKey);
      if (!varOption) return null;

      let data = weatherData.hourly[varKey] || [];

      if (varOption.isTemp && !isMetric) {
        data = data.map(v => (v * 9/5) + 32);
      } else if (varOption.isSpeed && !isMetric) {
        data = data.map(v => v * 0.621371);
      }

      return {
        data,
        color: (opacity = 1) => varOption.color,
        strokeWidth: 2
      };
    }).filter(Boolean);

    // Filter labels intelligently based on time range
    const labelSkip = timeRange <= 24 ? 2 : timeRange <= 72 ? 4 : timeRange <= 168 ? 6 : 8;
    const filteredLabels = labels.filter((_, i) => i % labelSkip === 0 || labels[i] !== '');

    return {
      labels: filteredLabels,
      datasets
    };
  };

  // Handler functions
  const toggleFavorite = () => {
    if (!selectedCity) return;

    const isFavorite = favorites.some(f => f.name === selectedCity.name);
    if (isFavorite) {
      setFavorites(prev => prev.filter(f => f.name !== selectedCity.name));
    } else {
      setFavorites(prev => [...prev, selectedCity]);
    }
  };

  const addCityToComparison = (city) => {
    if (comparisonCities.length >= 3) {
      Alert.alert('Limit Reached', 'You can only compare up to 3 cities at once.');
      return;
    }
    if (comparisonCities.some(c => c.name === city.name)) {
      return;
    }
    setComparisonCities(prev => [...prev, city]);
  };

  const removeCityFromComparison = (index) => {
    setComparisonCities(prev => prev.filter((_, i) => i !== index));
  };

  const exportToCSV = async () => {
    if (!weatherData) return;

    const headers = ['Time', ...selectedVariables.map(v => VARIABLE_OPTIONS.find(opt => opt.key === v)?.label || v)];
    const rows = weatherData.time.map((time, i) => {
      const row = [new Date(time).toLocaleString()];
      selectedVariables.forEach(varKey => {
        row.push(weatherData.hourly[varKey]?.[i] || '');
      });
      return row.join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const fileUri = FileSystem.documentDirectory + `weather_${selectedCity.name}_${Date.now()}.csv`;

    try {
      await FileSystem.writeAsStringAsync(fileUri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Success', 'CSV file created');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export CSV: ' + error.message);
    }
  };

  const exportToJSON = async () => {
    if (!weatherData) return;

    const jsonData = {
      city: selectedCity.name,
      exportTime: new Date().toISOString(),
      timeRange: timeRange,
      data: {
        time: weatherData.time,
        hourly: weatherData.hourly,
        current: weatherData.current
      }
    };

    const json = JSON.stringify(jsonData, null, 2);
    const fileUri = FileSystem.documentDirectory + `weather_${selectedCity.name}_${Date.now()}.json`;

    try {
      await FileSystem.writeAsStringAsync(fileUri, json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Success', 'JSON file created');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to export JSON: ' + error.message);
    }
  };

  const shareWeather = async () => {
    if (!selectedCity || !weatherData?.current) return;

    const message = `Weather in ${selectedCity.name}:\n` +
      `Temperature: ${formatTemp(weatherData.current.temperature)}\n` +
      `Wind: ${formatSpeed(weatherData.current.windspeed)}\n` +
      `Direction: ${weatherData.current.winddirection}°`;

    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ title: 'Weather Dashboard', text: message });
        } else {
          Alert.alert('Weather Info', message);
        }
      } else {
        await Share.share({ message });
      }
    } catch (error) {
      console.error('Share failed:', error);
    }
  };

  const getAQIDescription = (aqi) => {
    if (!aqi) return 'Unknown';
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  };

  // Filtered cities for search
  const filteredCities = searchQuery
    ? cities.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : cities.slice(0, 20);

  const screenWidth = Dimensions.get('window').width;
  const theme = isDark ? darkTheme : lightTheme;
  const isFavorite = selectedCity && favorites.some(f => f.name === selectedCity.name);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.card }]}>
          <Text style={[styles.title, { color: theme.text }]}>Weather Dashboard</Text>
          <TouchableOpacity
            onPress={() => setIsDark(!isDark)}
            style={styles.darkModeButton}
          >
            <Text style={styles.darkModeText}>{isDark ? '☀️' : '🌙'}</Text>
          </TouchableOpacity>
        </View>

        {/* Current Weather */}
        {weatherData?.current && (
          <View style={[styles.currentWeather, { backgroundColor: theme.card }]}>
            <View style={styles.cityHeader}>
              <Text style={[styles.cityName, { color: theme.text }]}>{selectedCity?.name}</Text>
              <TouchableOpacity onPress={toggleFavorite} style={styles.favoriteButton}>
                <Text style={styles.favoriteIcon}>{isFavorite ? '⭐' : '☆'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.temperature, { color: theme.text }]}>
              {formatTemp(weatherData.current.temperature)}
            </Text>
            <Text style={[styles.weatherDetail, { color: theme.textSecondary }]}>
              Wind: {formatSpeed(weatherData.current.windspeed)}
            </Text>
            <Text style={[styles.weatherDetail, { color: theme.textSecondary }]}>
              Direction: {weatherData.current.winddirection}°
            </Text>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity onPress={shareWeather} style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}>
                <Text style={styles.actionButtonText}>📤 Share</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={exportToCSV} style={[styles.actionButton, { backgroundColor: '#10B981' }]}>
                <Text style={styles.actionButtonText}>📊 CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={exportToJSON} style={[styles.actionButton, { backgroundColor: '#8B5CF6' }]}>
                <Text style={styles.actionButtonText}>📋 JSON</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Weather Alerts */}
        {weatherAlerts.length > 0 && (
          <View style={[styles.section, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[styles.sectionTitle, { color: '#DC2626' }]}>⚠️ Weather Alerts</Text>
            {weatherAlerts.map((alert, idx) => (
              <View key={idx} style={styles.alertItem}>
                <Text style={[styles.alertText, { color: '#991B1B' }]}>
                  {alert.severity === 'high' ? '🔴' : '🟡'} {alert.message}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Air Quality Index */}
        {aqiData?.current && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>🌫️ Air Quality</Text>
            <Text style={[styles.aqiText, { color: theme.text }]}>
              US AQI: {aqiData.current.us_aqi} - {getAQIDescription(aqiData.current.us_aqi)}
            </Text>
            <Text style={[styles.aqiText, { color: theme.text }]}>
              EU AQI: {aqiData.current.european_aqi} - {getAQIDescription(aqiData.current.european_aqi)}
            </Text>
          </View>
        )}

        {/* Favorites */}
        {favorites.length > 0 && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>⭐ Favorites</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {favorites.map(fav => (
                <TouchableOpacity
                  key={fav.name}
                  onPress={() => setSelectedCity(fav)}
                  style={[styles.cityChip, { backgroundColor: '#FCD34D' }]}
                >
                  <Text style={[styles.cityChipText, { color: '#78350F' }]}>{fav.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* City Search */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Select City:</Text>
          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.input, color: theme.text, borderColor: theme.border }]}
            placeholder="Search cities..."
            placeholderTextColor={theme.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.citiesScroll}>
            {filteredCities.map(city => (
              <TouchableOpacity
                key={city.name}
                onPress={() => {
                  setSelectedCity(city);
                  setSearchQuery('');
                }}
                style={[
                  styles.cityChip,
                  { backgroundColor: selectedCity?.name === city.name ? '#3B82F6' : theme.chipBackground },
                ]}
              >
                <Text style={[
                  styles.cityChipText,
                  { color: selectedCity?.name === city.name ? '#fff' : theme.text }
                ]}>
                  {city.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Map Toggle */}
        <TouchableOpacity
          onPress={() => setShowMap(!showMap)}
          style={[styles.button, { backgroundColor: showMap ? '#3B82F6' : theme.chipBackground }]}
        >
          <Text style={[styles.buttonText, { color: showMap ? '#fff' : theme.text }]}>
            {showMap ? '✓ Hide Map' : 'Show Map'}
          </Text>
        </TouchableOpacity>

        {/* Map */}
        {showMap && selectedCity && (
          <View style={styles.mapContainer}>
            <MapView
              style={styles.map}
              initialRegion={{
                latitude: selectedCity.lat,
                longitude: selectedCity.lon,
                latitudeDelta: 10,
                longitudeDelta: 10,
              }}
              region={{
                latitude: selectedCity.lat,
                longitude: selectedCity.lon,
                latitudeDelta: 10,
                longitudeDelta: 10,
              }}
            >
              {cities.slice(0, 50).map(city => {
                const isSelected = city.name === selectedCity?.name;
                return (
                  <Marker
                    key={city.name}
                    coordinate={{ latitude: city.lat, longitude: city.lon }}
                    title={city.name}
                    description={isSelected ? 'Currently Selected' : ''}
                    pinColor={isSelected ? '#3B82F6' : '#6B7280'}
                    onPress={() => setSelectedCity(city)}
                  />
                );
              })}
            </MapView>
          </View>
        )}

        {/* Time Range Selection */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Time Range:</Text>
          <View style={styles.timeRangeContainer}>
            {TIME_RANGES.map(range => (
              <TouchableOpacity
                key={range.value}
                onPress={() => setTimeRange(range.value)}
                style={[
                  styles.timeRangeButton,
                  { backgroundColor: timeRange === range.value ? '#3B82F6' : theme.chipBackground }
                ]}
              >
                <Text style={[
                  styles.timeRangeText,
                  { color: timeRange === range.value ? '#fff' : theme.text }
                ]}>
                  {range.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Units Toggle */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Units:</Text>
          <View style={styles.unitsContainer}>
            <TouchableOpacity
              onPress={() => setIsMetric(true)}
              style={[styles.unitButton, { backgroundColor: isMetric ? '#3B82F6' : theme.chipBackground }]}
            >
              <Text style={[styles.unitText, { color: isMetric ? '#fff' : theme.text }]}>Metric</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setIsMetric(false)}
              style={[styles.unitButton, { backgroundColor: !isMetric ? '#3B82F6' : theme.chipBackground }]}
            >
              <Text style={[styles.unitText, { color: !isMetric ? '#fff' : theme.text }]}>Imperial</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Variable Selection */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Variables:</Text>
          <View style={styles.variablesContainer}>
            {VARIABLE_OPTIONS.map(variable => (
              <TouchableOpacity
                key={variable.key}
                onPress={() => {
                  setSelectedVariables(prev =>
                    prev.includes(variable.key)
                      ? prev.filter(v => v !== variable.key)
                      : [...prev, variable.key]
                  );
                }}
                style={[
                  styles.variableChip,
                  { backgroundColor: selectedVariables.includes(variable.key) ? '#3B82F6' : theme.chipBackground }
                ]}
              >
                <Text style={[
                  styles.variableText,
                  { color: selectedVariables.includes(variable.key) ? '#fff' : theme.text }
                ]}>
                  {variable.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* City Comparison */}
        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <View style={styles.comparisonHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Compare Cities</Text>
            <TouchableOpacity
              onPress={() => setShowComparison(!showComparison)}
              style={[styles.button, { backgroundColor: showComparison ? '#3B82F6' : theme.chipBackground, marginBottom: 0 }]}
            >
              <Text style={[styles.buttonText, { color: showComparison ? '#fff' : theme.text }]}>
                {showComparison ? '✓ On' : 'Enable'}
              </Text>
            </TouchableOpacity>
          </View>

          {showComparison && (
            <View style={styles.comparisonContent}>
              <Text style={[styles.comparisonInfo, { color: theme.textSecondary }]}>
                Select up to 3 cities to compare side-by-side
              </Text>

              {/* Selected comparison cities */}
              <View style={styles.comparisonCities}>
                {comparisonCities.map((city, idx) => (
                  <View key={idx} style={[styles.comparisonCityChip, { backgroundColor: '#3B82F6' }]}>
                    <Text style={styles.comparisonCityText}>{city.name}</Text>
                    <TouchableOpacity onPress={() => removeCityFromComparison(idx)}>
                      <Text style={styles.removeComparisonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Add city button */}
              {comparisonCities.length < 3 && selectedCity && (
                <TouchableOpacity
                  onPress={() => addCityToComparison(selectedCity)}
                  style={[styles.addComparisonButton, { backgroundColor: '#10B981' }]}
                >
                  <Text style={styles.addComparisonText}>+ Add {selectedCity.name}</Text>
                </TouchableOpacity>
              )}

              {/* Comparison table */}
              {comparisonData.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.comparisonTable}>
                  <View>
                    <View style={styles.comparisonRow}>
                      <Text style={[styles.comparisonCell, styles.comparisonHeader, { color: theme.text }]}>City</Text>
                      {comparisonData.map((item, idx) => (
                        <Text key={idx} style={[styles.comparisonCell, { color: theme.text }]}>{item.city.name}</Text>
                      ))}
                    </View>
                    <View style={styles.comparisonRow}>
                      <Text style={[styles.comparisonCell, styles.comparisonHeader, { color: theme.text }]}>Temp</Text>
                      {comparisonData.map((item, idx) => (
                        <Text key={idx} style={[styles.comparisonCell, { color: theme.text }]}>
                          {formatTemp(item.current.temperature)}
                        </Text>
                      ))}
                    </View>
                    <View style={styles.comparisonRow}>
                      <Text style={[styles.comparisonCell, styles.comparisonHeader, { color: theme.text }]}>Wind</Text>
                      {comparisonData.map((item, idx) => (
                        <Text key={idx} style={[styles.comparisonCell, { color: theme.text }]}>
                          {formatSpeed(item.current.windspeed)}
                        </Text>
                      ))}
                    </View>
                  </View>
                </ScrollView>
              )}
            </View>
          )}
        </View>

        {/* Chart */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        )}

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.errorBackground }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && weatherData && getChartData() && (
          <View style={[styles.chartContainer, { backgroundColor: theme.card }]}>
            <Text style={[styles.chartTitle, { color: theme.text }]}>
              {selectedCity?.name || 'Weather'} - {(() => {
                const days = Math.floor(timeRange / 24);
                const hours = timeRange % 24;
                if (days > 0 && hours > 0) return `${days}d ${hours}h Forecast`;
                if (days > 0) return `${days} day${days > 1 ? 's' : ''} Forecast`;
                return `${hours} hour${hours > 1 ? 's' : ''} Forecast`;
              })()}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <LineChart
                data={getChartData()}
                width={Math.max(screenWidth - 32, timeRange * 20)}
                height={(() => {
                  const { width, height } = Dimensions.get('window');
                  const isLandscape = width > height;
                  // Landscape: shorter chart to fit on screen
                  if (isLandscape && width < 900) return 180;
                  // Portrait: taller for better readability
                  return 220;
                })()}
                chartConfig={{
                  backgroundColor: theme.card,
                  backgroundGradientFrom: theme.card,
                  backgroundGradientTo: theme.card,
                  decimalPlaces: 1,
                  color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                  labelColor: (opacity = 1) => theme.text,
                  style: {
                    borderRadius: 16
                  },
                  propsForDots: {
                    r: "3",
                    strokeWidth: "2",
                    stroke: "#3B82F6"
                  }
                }}
                bezier
                style={styles.chart}
              />
            </ScrollView>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const lightTheme = {
  background: '#F3F4F6',
  card: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
  border: '#D1D5DB',
  input: '#FFFFFF',
  chipBackground: '#E5E7EB',
  errorBackground: '#FEE2E2',
};

const darkTheme = {
  background: '#111827',
  card: '#1F2937',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
  border: '#374151',
  input: '#374151',
  chipBackground: '#374151',
  errorBackground: '#7F1D1D',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  darkModeButton: {
    padding: 8,
  },
  darkModeText: {
    fontSize: 24,
  },
  currentWeather: {
    margin: 16,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cityName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  temperature: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  weatherDetail: {
    fontSize: 16,
    marginVertical: 2,
  },
  section: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  citiesScroll: {
    marginTop: 8,
  },
  cityChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  cityChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  mapContainer: {
    margin: 16,
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
  },
  timeRangeText: {
    fontSize: 14,
    fontWeight: '500',
  },
  unitsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  unitText: {
    fontSize: 16,
    fontWeight: '600',
  },
  variablesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  variableChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  variableText: {
    fontSize: 14,
    fontWeight: '500',
  },
  loadingContainer: {
    margin: 16,
    padding: 40,
    alignItems: 'center',
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  chartContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  chart: {
    borderRadius: 16,
  },
  cityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  favoriteButton: {
    padding: 8,
  },
  favoriteIcon: {
    fontSize: 28,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  alertItem: {
    paddingVertical: 8,
  },
  alertText: {
    fontSize: 14,
    fontWeight: '500',
  },
  aqiText: {
    fontSize: 14,
    marginVertical: 4,
  },
  comparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  comparisonContent: {
    marginTop: 8,
  },
  comparisonInfo: {
    fontSize: 12,
    marginBottom: 12,
  },
  comparisonCities: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  comparisonCityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  comparisonCityText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  removeComparisonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addComparisonButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  addComparisonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  comparisonTable: {
    marginTop: 8,
  },
  comparisonRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  comparisonCell: {
    padding: 12,
    minWidth: 100,
    fontSize: 14,
  },
});
