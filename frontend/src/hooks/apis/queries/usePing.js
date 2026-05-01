import { useQuery } from '@tanstack/react-query';
import { pingApi } from '../../../apis/ping.js';

export default function usePing() {
    const { isLoading, isError, data, error } =  useQuery({
        queryFn: pingApi,
        queryKey: ['ping'],
        staleTime: 10000//tells  you how fresh you data is
        //you're  gaurenteed to not get another request for 10 seconds after the first successful one
    });

    return {
        isLoading,
        isError,
        data,
        error
    };
}