export default function timeBetween (startTime, finishTime = null, commitTime) {
    return (startTime && finishTime) ? ((commitTime >= startTime) && (commitTime <= finishTime)) : (commitTime == startTime)
}