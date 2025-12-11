import { useState, useEffect, useRef } from 'react';
import apiService from '../services/apiService';

export const useQuotes = () => {
  const [quote, setQuote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const hasFetched = useRef(false);

  const fetchRandomQuote = async () => {
    // Prevent multiple fetches
    if (hasFetched.current) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      hasFetched.current = true;
      
      const response = await apiService.getRandomQuote();
      
      if (response.success && response.data && response.data.quote) {
        setQuote(response.data.quote);
      } else {
        // Fallback to default text if no quote is available
        setQuote("Humza's personal movie tracker");
      }
    } catch (err) {
      console.error('Error fetching random quote:', err);
      setError(err.message);
      // Fallback to default text on error
      setQuote("Humza's personal movie tracker");
    } finally {
      setLoading(false);
    }
  };

  // Fetch a quote on component mount - only once
  useEffect(() => {
    fetchRandomQuote();
  }, []); // Empty dependency array ensures this only runs once

  return {
    quote,
    loading,
    error,
    refetchQuote: () => {
      // Allow manual refetch by resetting the flag
      hasFetched.current = false;
      fetchRandomQuote();
    }
  };
}; 