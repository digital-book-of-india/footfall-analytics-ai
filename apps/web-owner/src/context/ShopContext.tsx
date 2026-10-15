import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Shop, CreateShopInput, UpdateShopInput } from '../types';
import { api } from '../services/apiClient';
import { useAuth } from './AuthContext';

interface ShopContextType {
  shops: Shop[];
  selectedShop: Shop | null;
  isLoading: boolean;
  error: string | null;
  selectShop: (shopId: string) => void;
  refreshShops: () => Promise<void>;
  createShop: (input: CreateShopInput) => Promise<Shop>;
  updateShop: (shopId: string, input: UpdateShopInput) => Promise<Shop>;
}

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export const ShopProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshShops = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getShops();
      setShops(data);
      if (data.length > 0) {
        // Keep current selected shop if still valid, or default to first
        setSelectedShop(prev => {
          if (prev && data.some(s => s.id === prev.id)) {
            return data.find(s => s.id === prev.id)!;
          }
          return data[0];
        });
      } else {
        setSelectedShop(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch shops');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshShops();
    } else {
      setShops([]);
      setSelectedShop(null);
    }
  }, [isAuthenticated, refreshShops]);

  const selectShop = (shopId: string) => {
    const found = shops.find(s => s.id === shopId);
    if (found) {
      setSelectedShop(found);
    }
  };

  const createShop = async (input: CreateShopInput): Promise<Shop> => {
    setIsLoading(true);
    try {
      const newShop = await api.createShop(input);
      setShops(prev => [...prev, newShop]);
      setSelectedShop(newShop);
      return newShop;
    } catch (err: any) {
      setError(err.message || 'Failed to create shop');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateShop = async (shopId: string, input: UpdateShopInput): Promise<Shop> => {
    setIsLoading(true);
    try {
      const updated = await api.updateShop(shopId, input);
      setShops(prev => prev.map(s => (s.id === shopId ? updated : s)));
      if (selectedShop?.id === shopId) {
        setSelectedShop(updated);
      }
      return updated;
    } catch (err: any) {
      setError(err.message || 'Failed to update shop');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ShopContext.Provider
      value={{
        shops,
        selectedShop,
        isLoading,
        error,
        selectShop,
        refreshShops,
        createShop,
        updateShop
      }}
    >
      {children}
    </ShopContext.Provider>
  );
};

export const useShop = (): ShopContextType => {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
};
