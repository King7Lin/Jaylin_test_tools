# Usage Examples

## Complete Example Application

Here's a complete example of how to use react-native-network-mesh in a React Native application.

### App.js

```javascript
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Button,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import NetworkMeshManager from 'react-native-network-mesh';

const App = () => {
  const [meshManager] = useState(() => {
    return new NetworkMeshManager({
      clientCode: '555555',
      deviceId: 'pos-001',
      udp: {
        server: { port: 3399 },
        client: { broadcastInterval: 5000 },
      },
      webSocket: {
        server: { port: 8765, path: '/ws' },
        client: { 
          maxRetry: 3, 
          timeout: 30000,
        },
      },
      encryption: {
        enabled: false, // Set to true and provide key/iv in production
      },
    });
  });

  const [isRunning, setIsRunning] = useState(false);
  const [connectedDevices, setConnectedDevices] = useState([]);
  const [discoveredDevices, setDiscoveredDevices] = useState([]);

  useEffect(() => {
    // Register message handlers
    meshManager.registerHandler('ping', handlePing);
    meshManager.registerHandler('getData', handleGetData);

    // Start the service
    startMesh();

    // Cleanup on unmount
    return () => {
      stopMesh();
    };
  }, []);

  // Start mesh network
  const startMesh = async () => {
    try {
      await meshManager.start();
      setIsRunning(true);
      console.log('Network mesh started');
      
      // Update device lists periodically
      const interval = setInterval(updateDeviceLists, 2000);
      return () => clearInterval(interval);
    } catch (error) {
      Alert.alert('Error', 'Failed to start network mesh: ' + error.message);
    }
  };

  // Stop mesh network
  const stopMesh = async () => {
    try {
      await meshManager.stop();
      setIsRunning(false);
      console.log('Network mesh stopped');
    } catch (error) {
      Alert.alert('Error', 'Failed to stop network mesh: ' + error.message);
    }
  };

  // Update device lists
  const updateDeviceLists = () => {
    const discovered = meshManager.getDiscoveredDevices();
    const connected = meshManager.getConnectedDevices();
    
    setDiscoveredDevices(discovered);
    setConnectedDevices(connected);
  };

  // Handle ping request
  const handlePing = (message, sourceIP, reply) => {
    console.log('Received ping from:', sourceIP);
    
    reply({
      action: 'ping',
      msgType: 'response',
      payload: { 
        pong: true,
        timestamp: new Date().toISOString(),
      },
      result: 0,
      resultMsg: 'SUCCESS',
      requestUUID: message.requestUUID,
      responseDateTime: new Date().toISOString(),
    });
  };

  // Handle getData request
  const handleGetData = (message, sourceIP, reply) => {
    console.log('Received getData request from:', sourceIP);
    
    // Simulate getting data
    const data = {
      deviceId: 'pos-001',
      status: 'online',
      items: ['item1', 'item2', 'item3'],
    };
    
    reply({
      action: 'getData',
      msgType: 'response',
      payload: data,
      result: 0,
      resultMsg: 'SUCCESS',
      requestUUID: message.requestUUID,
      responseDateTime: new Date().toISOString(),
    });
  };

  // Send ping to device
  const sendPing = async (targetIP) => {
    try {
      const response = await meshManager.sendRequest(
        targetIP,
        'ping',
        { timestamp: new Date().toISOString() }
      );
      
      Alert.alert(
        'Ping Response',
        `Response from ${targetIP}:\n${JSON.stringify(response.response, null, 2)}`
      );
    } catch (error) {
      Alert.alert('Error', `Ping failed: ${error.message}`);
    }
  };

  // Get data from device
  const getDataFromDevice = async (targetIP) => {
    try {
      const response = await meshManager.sendRequest(
        targetIP,
        'getData',
        null
      );
      
      Alert.alert(
        'Data Response',
        `Data from ${targetIP}:\n${JSON.stringify(response.response.payload, null, 2)}`
      );
    } catch (error) {
      Alert.alert('Error', `Get data failed: ${error.message}`);
    }
  };

  // Broadcast ping to all devices
  const broadcastPing = async () => {
    try {
      const results = await meshManager.broadcastRequest(
        'ping',
        { timestamp: new Date().toISOString() }
      );
      
      const successCount = results.filter(r => r.success).length;
      Alert.alert(
        'Broadcast Complete',
        `Successfully pinged ${successCount}/${results.length} devices`
      );
    } catch (error) {
      Alert.alert('Error', `Broadcast failed: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Network Mesh Demo</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status: {isRunning ? '🟢 Running' : '🔴 Stopped'}
        </Text>
        <Text style={styles.statusText}>
          Local IP: {meshManager.getLocalIP() || 'Unknown'}
        </Text>
        <Text style={styles.statusText}>
          Connected: {connectedDevices.length} devices
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <Button
          title={isRunning ? "Stop Mesh" : "Start Mesh"}
          onPress={isRunning ? stopMesh : startMesh}
        />
        <Button
          title="Broadcast Ping"
          onPress={broadcastPing}
          disabled={!isRunning || connectedDevices.length === 0}
        />
        <Button
          title="Refresh"
          onPress={updateDeviceLists}
        />
      </View>

      <Text style={styles.sectionTitle}>Discovered Devices:</Text>
      <FlatList
        data={discoveredDevices}
        keyExtractor={(item) => item.ip}
        renderItem={({ item }) => (
          <View style={styles.deviceItem}>
            <Text style={styles.deviceIP}>{item.ip}</Text>
            <Text style={styles.deviceInfo}>
              Key: {item.key}
            </Text>
            <Text style={styles.deviceInfo}>
              Last seen: {new Date(item.lastSeen).toLocaleTimeString()}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No devices discovered</Text>
        }
      />

      <Text style={styles.sectionTitle}>Connected Devices:</Text>
      <FlatList
        data={connectedDevices.map(ip => ({ ip }))}
        keyExtractor={(item) => item.ip}
        renderItem={({ item }) => (
          <View style={styles.deviceItem}>
            <Text style={styles.deviceIP}>{item.ip}</Text>
            <View style={styles.deviceActions}>
              <Button
                title="Ping"
                onPress={() => sendPing(item.ip)}
              />
              <Button
                title="Get Data"
                onPress={() => getDataFromDevice(item.ip)}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No devices connected</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  statusContainer: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 10,
  },
  deviceItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  deviceIP: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  deviceInfo: {
    fontSize: 14,
    color: '#666',
  },
  deviceActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontStyle: 'italic',
    marginVertical: 20,
  },
});

export default App;
```

## Print Synchronization Example

A more advanced example showing how to synchronize print queues across multiple POS devices:

```javascript
import NetworkMeshManager from 'react-native-network-mesh';

class PrintSyncService {
  constructor(meshManager) {
    this.manager = meshManager;
    this.checkInterval = 5000;
    this.maxWaitTime = 60000;
    
    // Register handler
    this.manager.registerHandler('queryPrintQueue', this.handleQueryPrintQueue.bind(this));
  }

  // Handle query print queue request
  handleQueryPrintQueue(message, sourceIP, reply) {
    const printerIP = message.payload?.printerIP;
    const pendingJobs = this.getLocalPendingJobs(printerIP);
    
    reply({
      action: 'queryPrintQueue',
      msgType: 'response',
      payload: pendingJobs,
      result: 0,
      resultMsg: 'SUCCESS',
      requestUUID: message.requestUUID,
      responseDateTime: new Date().toISOString(),
    });
  }

  // Check before printing
  async checkBeforePrint(printerIP, currentJobTime) {
    const startTime = Date.now();
    let waitCount = 0;

    while (true) {
      // Check timeout
      if (Date.now() - startTime > this.maxWaitTime) {
        return { canPrint: true, reason: 'timeout' };
      }

      // Query all connected devices
      const connectedDevices = this.manager.getConnectedDevices();

      if (connectedDevices.length === 0) {
        return { canPrint: true, reason: 'no_other_devices' };
      }

      // Query all devices' print queues
      const results = await Promise.allSettled(
        connectedDevices.map(deviceIP =>
          this.manager.sendRequest(deviceIP, 'queryPrintQueue', { printerIP })
        )
      );

      // Check if any device has earlier jobs
      let shouldWait = false;

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          const pendingJobs = result.value.data.response?.payload || [];
          
          if (pendingJobs.length > 0) {
            const lastJob = pendingJobs[pendingJobs.length - 1];
            if (lastJob.createdAt <= currentJobTime) {
              shouldWait = true;
              break;
            }
          }
        }
      }

      if (shouldWait) {
        waitCount++;
        await this.sleep(this.checkInterval);
        continue;
      }

      return { canPrint: true, reason: 'check_passed', waitCount };
    }
  }

  getLocalPendingJobs(printerIP) {
    // Implement your logic to get pending print jobs
    // This is just a placeholder
    return [
      { id: 1, createdAt: new Date().toISOString(), status: 'PENDING' }
    ];
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
const meshManager = new NetworkMeshManager(config);
await meshManager.start();

const printSync = new PrintSyncService(meshManager);

// Before printing
const result = await printSync.checkBeforePrint('192.168.1.100', new Date().toISOString());
if (result.canPrint) {
  console.log('Can print now!');
  // Execute print job...
}
```

## TypeScript Example

```typescript
import NetworkMeshManager from 'react-native-network-mesh';

interface PrintJob {
  id: string;
  printerIP: string;
  content: string;
  createdAt: string;
}

interface MessagePayload {
  printJob?: PrintJob;
  status?: string;
  [key: string]: any;
}

const meshManager = new NetworkMeshManager({
  clientCode: '555555',
  deviceId: 'pos-001',
});

// Register typed handler
meshManager.registerHandler(
  'printJob',
  (message: any, sourceIP: string, reply: Function) => {
    const payload = message.payload as MessagePayload;
    
    if (payload.printJob) {
      // Process print job
      console.log('Print job received:', payload.printJob);
      
      reply({
        action: 'printJob',
        msgType: 'response',
        payload: { status: 'printed' },
        result: 0,
        resultMsg: 'SUCCESS',
        requestUUID: message.requestUUID,
        responseDateTime: new Date().toISOString(),
      });
    }
  }
);

// Send typed request
async function sendPrintJob(targetIP: string, job: PrintJob): Promise<any> {
  try {
    const response = await meshManager.sendRequest(
      targetIP,
      'printJob',
      { printJob: job }
    );
    return response;
  } catch (error) {
    console.error('Send print job failed:', error);
    throw error;
  }
}
```

