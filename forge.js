const { DataFrame } = require('data-forge');
const fs = require('fs');
const moment = require('moment');

function saveToFile(filename, data, encoding = 'utf8') {
	fs.writeFileSync(filename, data, encoding, (err) => {
		if (err) {
			console.error('Error while saving the file:', err);
		} else {
			console.log('File saved successfully.');
		}
	});
}

// Leer y preparar los datos
let rawData = fs.readFileSync('./data/reformatted.json');
let jsonData = JSON.parse(rawData);
let df = new DataFrame(jsonData);

let eveningDf = df
	.where((row) => {
		let dateTime = moment(row.DateTime, 'MM/DD/YYYY HH:mm:ss');
		return dateTime.hour() >= 20 && dateTime.hour() <= 23;
	})
	.select((row) => {
		let newRow = Object.assign({}, row);
		return newRow;
	});

let earlyMorningDf = df
	.where((row) => {
		let dateTime = moment(row.DateTime, 'MM/DD/YYYY HH:mm:ss');
		return dateTime.hour() === 0 || (dateTime.hour() === 1 && dateTime.minute() === 0);
	})
	.select((row) => {
		let newRow = Object.assign({}, row);
		return newRow;
	});

let combinedDf = eveningDf.concat(earlyMorningDf).orderBy((row) => moment(row.DateTime, 'MM/DD/YYYY HH:mm:ss'));

// Analyzing data to find the highest and lowest values within the time range
let earlyResults = combinedDf
	.groupBy((row) => moment(row.DateTime, 'MM/DD/YYYY HH:mm:ss').format('MM/DD/YYYY')) // Grouping by date
	.select((group) => {
		let groupData = group.toArray(); // Convert group to array to work with and log
		const Highest = group.deflate((row) => row.High).max(); // Finding the highest value
		const Lowest = group.deflate((row) => row.Low).min(); // Finding the lowest value
		const PercentageDifference = ((Highest - Lowest) / Lowest) * 100;

		// Prepare the data to be saved
		return {
			Date: group.first().Date,
			Highest: Highest,
			Lowest: Lowest,
			PercentageDifference: PercentageDifference,
			Details: groupData,
		};
	})
	.toArray()
	.reduce((acc, curr) => {
		acc[curr.Date] = curr;
		return acc;
	}, {});

// saveToFile('daily_high_and_low.json', JSON.stringify(earlyResults, null, 2), 'utf8');

let restOfDays = df
	.where((row) => {
		let dateTime = moment(row.DateTime, 'MM/DD/YYYY HH:mm:ss');
		// Asegurar que la hora esté entre las 01:05 y las 17:59
		return (dateTime.hour() === 1 && dateTime.minute() >= 5) || (dateTime.hour() > 1 && dateTime.hour() < 15) || (dateTime.hour() === 15 && dateTime.minute() <= 59);
	})
	.orderBy((row) => moment(row.DateTime, 'MM/DD/YYYY HH:mm:ss')) // Ordenar por DateTime
	.select((row) => {
		let newRow = Object.assign({}, row);
		return newRow;
	});

// saveToFile('sorted_rest_of_days.json', JSON.stringify(restOfDays.toArray(), null, 2), 'utf8');

// Analizar el resto del día
let results = restOfDays
	.groupBy((row) => moment(row.DateTime, 'MM/DD/YYYY HH:mm:ss').format('MM/DD/YYYY'))
	.select((group) => {
		const date = group.first().Date;

		const dayData = earlyResults[date];
		if (!dayData) {
			return {
				Date: date,
				Highest: 'No data',
				Lowest: 'No data',
				PercentageDifference: 'No data',
				PassedHighest: false,
				PassedLowest: false,
				TakeProfit: 'No data',
				StopLoss: 'No data',
			};
		}

		const groupArray = group.toArray();
		const PassedHighest = group.deflate((row) => row.High).max() > dayData.Highest;
		const PassedLowest = group.deflate((row) => row.Low).min() < dayData.Lowest;
		const PercentageDifference = parseFloat(dayData?.PercentageDifference);
		const TakeProfit = PassedHighest ? dayData.Highest * (1 + PercentageDifference / 100) : dayData.Lowest * (1 - PercentageDifference / 100);
		const StopLoss = PassedHighest ? dayData.Lowest : dayData.Highest;

		let takeProfitReached = false;
		let stopLossReached = false;
		let winTrade = false;

		for (let row of groupArray) {
			if (!takeProfitReached && row.High >= TakeProfit) {
				takeProfitReached = true;
			}
			if (!stopLossReached && row.Low <= StopLoss) {
				stopLossReached = true;
			}

			if (takeProfitReached && !stopLossReached) {
				winTrade = true;
				break;
			} else if (stopLossReached) {
				winTrade = false;
				break;
			}
		}

		return {
			Date: date,
			Highest: dayData.Highest,
			Lowest: dayData.Lowest,
			PercentageDifference: dayData.PercentageDifference,
			PassedHighest: PassedHighest,
			PassedLowest: PassedLowest,
			TakeProfit: TakeProfit.toFixed(2),
			StopLoss: StopLoss.toFixed(2),
			WinTrade: winTrade,
		};
	})
	.toArray();

// Guardar los resultados finales
saveToFile('complete_analysis_results.json', JSON.stringify(results, null, 2), 'utf8');
