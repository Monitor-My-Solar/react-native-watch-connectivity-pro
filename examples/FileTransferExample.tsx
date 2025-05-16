import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import WatchConnectivity from 'react-native-watch-connectivity-pro';

const FileTransferExample = () => {
  const [isWatchPaired, setIsWatchPaired] = useState(false);
  const [isWatchReachable, setIsWatchReachable] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [fileTransfers, setFileTransfers] = useState<any[]>([]);
  const [receivedFiles, setReceivedFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Initialize watch connectivity
    initializeWatchConnectivity();

    // Set up event listeners
    const transferProgressSubscription = WatchConnectivity.addListener(
      'fileTransferProgress',
      handleFileTransferProgress
    );

    const transferFinishedSubscription = WatchConnectivity.addListener(
      'fileTransferFinished',
      handleFileTransferFinished
    );

    const transferErrorSubscription = WatchConnectivity.addListener(
      'fileTransferError',
      handleFileTransferError
    );

    const fileReceivedSubscription = WatchConnectivity.addListener(
      'fileReceived',
      handleFileReceived
    );

    const watchStateSubscription = WatchConnectivity.addListener(
      'watchStateUpdated',
      handleWatchStateChanged
    );

    // Clean up subscriptions on unmount
    return () => {
      transferProgressSubscription.remove();
      transferFinishedSubscription.remove();
      transferErrorSubscription.remove();
      fileReceivedSubscription.remove();
      watchStateSubscription.remove();
    };
  }, []);

  const initializeWatchConnectivity = async () => {
    try {
      setIsLoading(true);
      const sessionState = await WatchConnectivity.initSession();
      console.log('Watch session state:', sessionState);
      setIsWatchPaired(sessionState.isPaired);
      setIsWatchReachable(sessionState.isReachable);

      // Get existing file transfers
      await getActiveFileTransfers();
    } catch (error) {
      console.error('Failed to initialize watch connectivity:', error);
      Alert.alert('Error', 'Failed to initialize watch connectivity');
    } finally {
      setIsLoading(false);
    }
  };

  const getActiveFileTransfers = async () => {
    try {
      const transfers = await WatchConnectivity.getFileTransfers();
      console.log('Active file transfers:', transfers);
      setFileTransfers(transfers);
    } catch (error) {
      console.error('Failed to get file transfers:', error);
    }
  };

  const handleWatchStateChanged = (event: any) => {
    const { watchState } = event;
    console.log('Watch state changed:', watchState);
    setIsWatchPaired(watchState.isPaired);
    setIsWatchReachable(watchState.isReachable);
  };

  const handleFileTransferProgress = (event: any) => {
    console.log('File transfer progress:', event);
    // Update the progress of the file transfer in the list
    setFileTransfers((prevTransfers) => {
      return prevTransfers.map((transfer) => {
        if (transfer.id === event.id) {
          return { ...transfer, progress: event.progress };
        }
        return transfer;
      });
    });
  };

  const handleFileTransferFinished = (event: any) => {
    console.log('File transfer finished:', event);
    Alert.alert('Success', `File transfer completed: ${event.fileName}`);
    
    // Remove the file transfer from the list
    setFileTransfers((prevTransfers) => {
      return prevTransfers.filter((transfer) => transfer.id !== event.id);
    });
  };

  const handleFileTransferError = (event: any) => {
    console.error('File transfer error:', event);
    
    // Show an error alert
    Alert.alert('Error', `File transfer failed: ${event.error?.message || 'Unknown error'}`);
    
    // Remove the file transfer from the list
    setFileTransfers((prevTransfers) => {
      return prevTransfers.filter((transfer) => transfer.id !== event.id);
    });
  };

  const handleFileReceived = (event: any) => {
    console.log('File received:', event);
    
    // Add the file to the list of received files
    setReceivedFiles((prevFiles) => [event, ...prevFiles]);
    
    // Show a success alert
    Alert.alert('File Received', `Received file: ${event.fileName}`);
  };

  const selectImage = async () => {
    // Check for permissions if on Android
    if (Platform.OS === 'android') {
      const hasPermission = await requestExternalStoragePermission();
      if (!hasPermission) {
        return;
      }
    }

    // Launch image picker
    launchImageLibrary(
      {
        mediaType: 'photo',
        includeBase64: false,
        maxHeight: 800,
        maxWidth: 800,
      },
      (response) => {
        console.log('Image picker response:', response);
        
        if (response.didCancel) {
          console.log('User cancelled image picker');
        } else if (response.errorCode) {
          console.error('Image picker error:', response.errorMessage);
          Alert.alert('Error', response.errorMessage || 'Failed to pick image');
        } else if (response.assets && response.assets.length > 0) {
          const selectedAsset = response.assets[0];
          
          if (selectedAsset.uri) {
            setSelectedImage(selectedAsset.uri);
            
            // Optional: Copy the image to the app's documents directory for easier access
            const fileName = selectedAsset.uri.split('/').pop() || `image_${Date.now()}.jpg`;
            const destPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
            
            RNFS.copyFile(selectedAsset.uri, destPath)
              .then(() => {
                console.log('Image copied to:', destPath);
                setSelectedImage(destPath);
              })
              .catch((error) => {
                console.error('Failed to copy image:', error);
                // Still use the original URI if copy fails
                setSelectedImage(selectedAsset.uri);
              });
          }
        }
      }
    );
  };

  const transferImageToWatch = async () => {
    if (!selectedImage) {
      Alert.alert('Error', 'Please select an image first');
      return;
    }

    if (!isWatchReachable) {
      Alert.alert('Watch Not Reachable', 'The Apple Watch is not reachable. Please ensure it is nearby and connected.');
      return;
    }

    try {
      setIsLoading(true);
      
      // Add metadata to the file
      const metadata = {
        type: 'image',
        timestamp: Date.now(),
        source: 'FileTransferExample'
      };
      
      // Transfer the file to the watch
      const transfer = await WatchConnectivity.transferFile(selectedImage, metadata);
      console.log('File transfer started:', transfer);
      
      // Add the new transfer to the list
      setFileTransfers((prevTransfers) => [...prevTransfers, transfer]);
      
      // Show a success message
      Alert.alert('Transfer Started', 'Image transfer to watch has started');
    } catch (error) {
      console.error('Failed to transfer file:', error);
      Alert.alert('Error', `Failed to transfer file: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelFileTransfer = async (transferId: string) => {
    try {
      await WatchConnectivity.cancelFileTransfer(transferId);
      console.log('File transfer cancelled:', transferId);
      
      // Remove the transfer from the list
      setFileTransfers((prevTransfers) => {
        return prevTransfers.filter((transfer) => transfer.id !== transferId);
      });
      
      // Show a success message
      Alert.alert('Transfer Cancelled', 'File transfer has been cancelled');
    } catch (error) {
      console.error('Failed to cancel file transfer:', error);
      Alert.alert('Error', `Failed to cancel transfer: ${error.message || 'Unknown error'}`);
    }
  };

  const requestExternalStoragePermission = async () => {
    if (Platform.OS !== 'android') return true;
    
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Storage Permission',
          message: 'This app needs access to your storage to select photos.',
          buttonPositive: 'OK',
        }
      );
      
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.error('Failed to request permission:', err);
      return false;
    }
  };

  const refreshStatus = async () => {
    await initializeWatchConnectivity();
  };

  // Render a file transfer item
  const renderFileTransferItem = (transfer: any, index: number) => {
    const progress = Math.round((transfer.progress || 0) * 100);
    
    return (
      <View key={`transfer_${index}`} style={styles.transferItem}>
        <Text style={styles.transferTitle}>{transfer.fileName || 'File'}</Text>
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
          <Text style={styles.progressText}>{`${progress}%`}</Text>
        </View>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => cancelFileTransfer(transfer.id)}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Render a received file item
  const renderReceivedFileItem = (file: any, index: number) => {
    const isImage = file.fileName.match(/\.(jpg|jpeg|png|gif)$/i);
    
    return (
      <View key={`file_${index}`} style={styles.fileItem}>
        {isImage && file.file ? (
          <Image source={{ uri: file.file }} style={styles.fileImage} />
        ) : (
          <View style={styles.fileIconContainer}>
            <Text style={styles.fileIcon}>📄</Text>
          </View>
        )}
        <View style={styles.fileInfo}>
          <Text style={styles.fileName}>{file.fileName || 'Unknown file'}</Text>
          <Text style={styles.fileSize}>
            {file.fileSize ? `${Math.round(file.fileSize / 1024)} KB` : 'Unknown size'}
          </Text>
          <Text style={styles.fileDate}>
            {file.timestamp ? new Date(file.timestamp * 1000).toLocaleString() : 'Unknown date'}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>File Transfer Example</Text>
      
      {/* Watch Status */}
      <View style={styles.statusContainer}>
        <Text style={styles.statusLabel}>Watch Status:</Text>
        <Text style={styles.statusValue}>
          {isWatchPaired ? 'Paired' : 'Not Paired'}{' '}
          {isWatchPaired && `(${isWatchReachable ? 'Reachable' : 'Not Reachable'})`}
        </Text>
        <TouchableOpacity style={styles.refreshButton} onPress={refreshStatus}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>
      
      {/* Image Selection */}
      <View style={styles.imageSection}>
        <TouchableOpacity
          style={styles.selectButton}
          onPress={selectImage}
          disabled={isLoading}
        >
          <Text style={styles.selectButtonText}>Select Image</Text>
        </TouchableOpacity>
        
        {selectedImage ? (
          <View style={styles.selectedImageContainer}>
            <Image source={{ uri: selectedImage }} style={styles.selectedImage} />
            <TouchableOpacity
              style={styles.transferButton}
              onPress={transferImageToWatch}
              disabled={!isWatchReachable || isLoading}
            >
              <Text style={styles.transferButtonText}>
                Transfer to Watch
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.noImageText}>No image selected</Text>
        )}
      </View>
      
      {/* Loading Indicator */}
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}
      
      {/* Transfers Section */}
      <Text style={styles.sectionTitle}>Active Transfers</Text>
      <ScrollView style={styles.transfersContainer}>
        {fileTransfers.length > 0 ? (
          fileTransfers.map(renderFileTransferItem)
        ) : (
          <Text style={styles.emptyText}>No active transfers</Text>
        )}
      </ScrollView>
      
      {/* Received Files Section */}
      <Text style={styles.sectionTitle}>Received Files</Text>
      <ScrollView style={styles.filesContainer}>
        {receivedFiles.length > 0 ? (
          receivedFiles.map(renderReceivedFileItem)
        ) : (
          <Text style={styles.emptyText}>No files received from watch</Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  statusLabel: {
    fontWeight: 'bold',
    marginRight: 8,
  },
  statusValue: {
    flex: 1,
  },
  refreshButton: {
    backgroundColor: '#e0e0e0',
    padding: 6,
    borderRadius: 6,
  },
  refreshButtonText: {
    fontSize: 12,
  },
  imageSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  selectButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  selectButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  selectedImageContainer: {
    alignItems: 'center',
  },
  selectedImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  transferButton: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
  },
  transferButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  noImageText: {
    textAlign: 'center',
    marginTop: 12,
    color: '#888',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 8,
    color: '#0000ff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  transfersContainer: {
    flex: 1,
    marginBottom: 16,
  },
  transferItem: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  transferTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  progressContainer: {
    height: 20,
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  progressText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    color: '#000',
    fontSize: 12,
    lineHeight: 20,
  },
  cancelButton: {
    backgroundColor: '#f44336',
    padding: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  filesContainer: {
    flex: 1,
  },
  fileItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  fileImage: {
    width: 60,
    height: 60,
    borderRadius: 4,
    marginRight: 12,
  },
  fileIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileIcon: {
    fontSize: 30,
  },
  fileInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  fileName: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  fileSize: {
    fontSize: 12,
    color: '#888',
    marginBottom: 2,
  },
  fileDate: {
    fontSize: 12,
    color: '#888',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    padding: 20,
  },
});

export default FileTransferExample; 