import { io } from "socket.io-client";
import { useEffect, useState } from "react";
import { FaCircle } from "react-icons/fa6";

export default function OnlinePlayers() {
    const [onlinePlayers, setOnlinePlayers] = useState([]);
    const serverUrl = import.meta.env.VITE_APP_URL;

    useEffect(() => {
        if (!serverUrl) return;

        const socket = io(serverUrl, { autoConnect: true });

        socket.on("joined", (players) => {
            setOnlinePlayers(players);
        });

        return () => {
            socket.off("joined");
            socket.disconnect();
        };
    }, [serverUrl]);

    return (
        <div className="fixed bottom-4 right-4 bg-[#191A2E] border border-white rounded-lg p-4 w-40">

            <ul className="mb-2 space-y-2">
                {onlinePlayers.length > 0 ? (
                    onlinePlayers.map((player, index) => (
                        <div
                            className="flex items-center justify-between gap-1"
                            key={index}
                        >
                            <FaCircle className="text-[#E94560] text-[8px] inline-block mr-1" />
                            <li
                                className="text-white text-sm font-medium rounded-md"
                            >
                                {player}
                            </li>
                        </div>
                    ))
                ) : (
                    <li className="text-gray-400 text-sm text-center">No players online</li>
                )}
            </ul>
            <h2 className="text-white text-sm font-bold border-t border-gray-600 pt-2 text-center">
                Online Players
            </h2>
        </div>
    );
}
